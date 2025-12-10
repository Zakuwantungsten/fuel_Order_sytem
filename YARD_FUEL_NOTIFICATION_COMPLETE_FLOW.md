# Complete Yard Fuel Notification System Flow

## Overview
This document describes the complete end-to-end notification flow for the yard fuel workflow, including creation, pending states, resolution, and successful linking notifications.

---

## 🔄 Complete Workflow Scenarios

### **Scenario 1: Yard Fuel Recorded with Immediate Link**

**Flow:**
1. Yard man enters fuel data (truck number, liters, date)
2. System searches for matching DO/fuel record (±2 days)
3. **Match found** → Status: `linked`
4. **Notification sent to fuel order maker**: "Truck ABC-123 fueled with 200L at Dar Yard"

**Status:** ✅ Linked immediately  
**Notifications:**
- Fuel order maker gets "yard_fuel_recorded" notification (status: resolved)
- No pending state needed

---

### **Scenario 2: Yard Fuel Pending → DO Created → Auto-Linked**

**Flow:**

#### Step 1: Yard Man Entry (No DO exists yet)
- Yard man enters: Truck ABC-123, 200L, 2025-01-15
- System searches for DO/fuel record → **Not found**
- Status: `pending`
- **Notifications created:**
  - ✉️ **Fuel order maker** gets "truck_pending_linking" notification
    - Message: "Truck ABC-123 has 200L recorded at Dar Yard, but no active DO found"
    - Action button: "View Pending Entries"

#### Step 2: Fuel Order Maker Creates DO
- Fuel order maker creates DO with truck ABC-123
- System automatically calls `/api/yard-fuel/link-pending` endpoint
- Backend searches pending entries for ABC-123 (±2 days)
- **Finds match** → Updates status to `linked`

#### Step 3: Automatic Resolution & Notifications
Backend performs:
1. **Resolve pending notifications** for this yard fuel entry
   - Status: pending → resolved
   - Mark as read: true
2. **Notify yard man of success**
   - ✉️ **Yard personnel** gets "yard_fuel_recorded" notification
   - Message: "Good news! Your pending fuel entry for truck ABC-123 has been successfully linked to DO XYZ-001"

**Final Status:** ✅ Linked  
**Notifications:**
- Fuel order maker: Pending notification → Resolved
- Yard man: Success notification received

---

### **Scenario 3: Yard Fuel Pending → Rejected by Fuel Order Maker**

**Flow:**

#### Step 1: Yard Man Entry (Wrong truck number)
- Yard man enters: Truck ABC-999 (typo), 200L
- System searches → Not found
- Status: `pending`
- **Notification:** Fuel order maker gets "truck_pending_linking"

#### Step 2: Fuel Order Maker Reviews & Rejects
- Fuel order maker clicks yellow "Pending Entries" button
- Sees ABC-999 in list
- Clicks "Reject" → Modal opens
- Enters reason: "Incorrect truck number - should be ABC-123"

#### Step 3: Rejection Processing
Backend:
1. Updates yard fuel entry:
   - isDeleted: true
   - rejectionReason: "Incorrect truck number..."
   - rejectedBy: username
   - History: Add "rejected" action
2. **Notifies yard man:**
   - ✉️ **Yard personnel** gets "truck_entry_rejected" notification
   - Message: "Entry rejected: ABC-999 - Reason: Incorrect truck number..."

#### Step 4: Yard Man Re-enters Correct Data
- Yard man sees rejection in "Rejections" tab
- Re-enters with correct truck: ABC-123
- New pending entry created OR auto-linked if DO now exists

**Final Status:** ❌ Rejected  
**Notifications:**
- Yard man: Rejection notification with reason

---

## 📋 Notification Types & Recipients

### 1. `yard_fuel_recorded`
**When:** Yard fuel successfully linked (immediate or later)  
**Recipient:** Fuel order maker OR yard personnel (success notification)  
**Status:** Usually `resolved` (informational)  
**Actions:** View fuel record details

### 2. `truck_pending_linking`
**When:** Yard fuel entered but no DO found  
**Recipient:** Fuel order maker  
**Status:** `pending` (requires follow-up)  
**Actions:** 
- View pending entries (yellow button)
- Create DO to auto-link
- Reject entry

### 3. `truck_entry_rejected`
**When:** Fuel order maker rejects a pending entry  
**Recipient:** Yard personnel (specific yard role)  
**Status:** `resolved` (completed rejection)  
**Actions:** View rejection history, re-enter correct data

---

## 🎯 Key Features Implemented

### Backend
1. **Auto-linking on Fuel Record Creation**
   - Endpoint: `POST /api/yard-fuel/link-pending`
   - Called automatically when DO/fuel record created
   - Searches ±2 days for matching pending entries
   - Updates status to `linked`
   - Resolves pending notifications
   - Notifies yard man of success

2. **Notification Resolution**
   - Function: `resolvePendingYardFuelNotifications()`
   - Marks notifications as resolved when entry linked
   - Sets `isRead: true` and `resolvedAt: timestamp`

3. **Success Notification for Yard Man**
   - Function: `createYardFuelLinkedNotification()`
   - Sends positive feedback when pending entry links
   - Includes DO number and truck details

### Frontend
1. **NotificationBell Component**
   - Yellow button shows pending entry count
   - Click opens PendingYardFuel modal
   - "View all notifications" button now functional

2. **PendingYardFuel Modal**
   - Lists all pending entries
   - Rejection workflow with reason textarea
   - Auto-refreshes after rejection

3. **NotificationsPage Component** (NEW)
   - Full-page view of all notifications
   - Filter by: All, Pending, Resolved
   - Statistics: Total, Pending, Resolved, Unread
   - Actions: Mark as read, Resolve, Dismiss
   - Responsive design with scroll

4. **YardFuelSimple Component**
   - "Rejections" tab shows rejection history
   - Displays rejection reason and timestamp
   - Helps yard man understand mistakes

---

## 🔔 Notification Bell UI States

### Badge Colors
- **Red badge** (>0): Unread notifications
- **Yellow button**: Pending yard fuel entries exist
- **No badge**: All notifications read

### Dropdown Sections
1. **Recent notifications** (top 10)
2. **Yellow button** (if pending > 0): "View X Pending Entries"
3. **Footer button**: "View all notifications"

---

## 🧪 Testing Scenarios

### Test 1: Pending → Auto-Link
1. Enter yard fuel for truck ABC-123 (no DO exists)
2. Check fuel order maker sees yellow button + pending notification
3. Create DO for ABC-123
4. Verify:
   - Pending notification disappears/resolved
   - Yard man receives success notification
   - Yard fuel status = `linked`

### Test 2: Pending → Rejection
1. Enter yard fuel with wrong truck: ABC-999
2. Fuel order maker clicks yellow button
3. Reject entry with reason
4. Verify:
   - Yard man sees rejection in "Rejections" tab
   - Notification sent to yard man
   - Entry marked as deleted

### Test 3: View All Notifications
1. Click "View all notifications" in dropdown
2. Verify:
   - Modal opens with all notifications
   - Filter tabs work (All, Pending, Resolved)
   - Statistics display correctly
   - Actions work (mark read, resolve, dismiss)

---

## 📊 Database Fields

### YardFuelDispense
```typescript
{
  status: 'pending' | 'linked' | 'unlinked',
  linkedFuelRecordId: ObjectId,
  linkedDONumber: string,
  autoLinked: boolean,
  rejectionReason: string,
  rejectedBy: string,
  rejectedAt: Date,
  history: [{
    action: 'created' | 'linked' | 'rejected',
    performedBy: string,
    timestamp: Date,
    details: object
  }]
}
```

### Notification
```typescript
{
  type: 'yard_fuel_recorded' | 'truck_pending_linking' | 'truck_entry_rejected',
  status: 'pending' | 'resolved',
  isRead: boolean,
  resolvedAt: Date,
  resolvedBy: string,
  metadata: {
    truckNo: string,
    doNumber: string,
    liters: number,
    yard: string,
    enteredBy: string,
    rejectionReason: string
  }
}
```

---

## 🚀 API Endpoints

### Yard Fuel Operations
```
POST   /api/yard-fuel                    - Create yard fuel entry
POST   /api/yard-fuel/:id/reject         - Reject pending entry
GET    /api/yard-fuel/pending            - Get all pending entries
GET    /api/yard-fuel/history/rejections - Get rejection history
POST   /api/yard-fuel/link-pending       - Link pending to fuel record
```

### Notifications
```
GET    /api/notifications                - Get all notifications
PATCH  /api/notifications/:id/read       - Mark as read
PATCH  /api/notifications/:id/resolve    - Mark as resolved
DELETE /api/notifications/:id            - Dismiss notification
```

---

## 🎨 User Experience Flow

### Fuel Order Maker Journey
1. **Bell icon** shows red badge (3 unread)
2. Click bell → Dropdown opens
3. See notification: "Truck ABC-123 pending linking"
4. **Yellow button** appears: "View 2 Pending Entries"
5. Click yellow button → Modal opens
6. See list of pending entries with truck details
7. **Option A:** Wait for auto-link (create DO)
8. **Option B:** Reject with reason
9. After action: Notification resolves, badge updates

### Yard Man Journey
1. Enter fuel data → Submit
2. If no DO: Status shows "Pending"
3. Later: **Notification received**
   - **Success:** "Your entry was linked to DO XYZ-001"
   - **Rejection:** "Entry rejected: Incorrect truck number..."
4. If rejected: Go to "Rejections" tab
5. See reason, re-enter correct data

---

## 🔒 Authorization

### Endpoints
- **Create yard fuel:** yard_personnel, dar_yard, tanga_yard, mmsa_yard
- **Reject entry:** fuel_order_maker, admin, super_admin
- **View rejections:** yard_personnel (own yard only)
- **Link pending:** fuel_order_maker, admin (auto-called on DO create)

### Notification Recipients
- **yard_fuel_recorded:** fuel_order_maker OR yard role (based on context)
- **truck_pending_linking:** fuel_order_maker
- **truck_entry_rejected:** yard role (e.g., dar_yard, tanga_yard)

---

## ✅ Implementation Checklist

- [x] Backend: Auto-link function in yardFuelController
- [x] Backend: Notification resolution function
- [x] Backend: Success notification for yard man
- [x] Backend: Route for link-pending endpoint
- [x] Backend: Call link-pending from fuelRecordController
- [x] Frontend: NotificationsPage component
- [x] Frontend: Wire up "View all" button in NotificationBell
- [x] Frontend: Pass onViewAllNotifications callback
- [x] Frontend: yardFuelAPI.linkPending method
- [x] Documentation: Complete flow guide

---

## 🐛 Troubleshooting

### Notifications not resolving after DO creation
- Check: Is link-pending endpoint being called?
- Check: Are truck numbers matching (case-insensitive)?
- Check: Is date within ±2 days range?
- Check: Backend logs for linking errors

### Yard man not receiving success notification
- Check: Yard role in recipients array matches user role
- Check: createYardFuelLinkedNotification called after linking
- Check: Notification polling interval (30s)

### "View all" button not working
- Check: onViewAllNotifications prop passed to NotificationBell
- Check: showNotificationsPage state in EnhancedDashboard
- Check: NotificationsPage imported correctly

---

## 📈 Future Enhancements

1. **Real-time notifications** (WebSocket/SSE instead of polling)
2. **Email notifications** for critical events
3. **Push notifications** for mobile
4. **Notification preferences** (user can configure which notifications to receive)
5. **Batch operations** (approve/reject multiple pending entries)
6. **Smart matching** (fuzzy truck number matching for typos)

---

## 📝 Summary

This notification system provides:
- ✅ **Bidirectional communication** between yard personnel and fuel order makers
- ✅ **Automatic resolution** when pending entries get linked
- ✅ **Rejection workflow** with reason tracking
- ✅ **Success feedback** to yard man when entry links
- ✅ **Full notification management** page
- ✅ **Complete audit trail** in history array

The system ensures **no entry goes unnoticed** and provides **clear feedback loops** for all stakeholders.
