# How to Reject Yard Fuel Entries - User Guide

## For Fuel Order Makers

When a yard man records fuel for a truck that doesn't have an active DO, you'll be notified and can review and reject incorrect entries.

### Steps to View and Reject Pending Entries:

### Method 1: From Notification Bell (Recommended)

1. **Check Notification Bell** (Top right corner)
   - You'll see a red badge with the number of unread notifications
   - Click the bell icon to open notifications dropdown

2. **Look for Yellow Button**
   - At the top of the notifications dropdown, you'll see a yellow button
   - Button text: **"View X Pending Yard Fuel Entries"**
   - This shows how many trucks are awaiting DO linkage

3. **Click the Yellow Button**
   - Opens the "Pending Yard Fuel Entries" modal
   - Shows all pending entries that need review

4. **Review Each Entry**
   - Each card shows:
     - Truck number
     - Liters recorded
     - Yard location (DAR YARD, TANGA YARD, MMSA YARD)
     - Date recorded
     - Who entered it (yard man name)
     - Any notes from yard man
   - Status badge shows "PENDING"

5. **Reject Incorrect Entry**
   - Click the **"Reject"** button on the entry
   - A modal pops up asking for rejection reason
   - Enter reason (e.g., "Incorrect truck number. Should be ABC 124 not ABC 123")
   - Click **"Confirm Rejection"**

6. **System Actions**
   - Entry is marked as rejected
   - Yard man receives notification immediately
   - Notification shows rejection reason
   - Yard man can see rejection in their "Rejections" tab

### Method 2: Click on Yard Fuel Notifications

1. **Click on any yard fuel notification** in the dropdown
   - Notifications with truck icon 🚚
   - Yellow/green colored notifications about yard fuel
   - Automatically opens the Pending Yard Fuel modal

### What Yard Men See After Rejection:

1. **Rejection Notification**
   - Red notification appears for the specific yard
   - Shows truck number, liters, rejection reason
   - Shows who rejected it

2. **Rejections Tab in Yard Interface**
   - Switch to "Rejections" tab (second tab)
   - See all rejected entries
   - Red-bordered cards with rejection details
   - "Action Required" message
   - Instructions to re-enter with correct information

3. **Re-entry**
   - Yard man can immediately re-enter with correct truck number
   - New entry will attempt to auto-link to DO
   - If DO exists, links automatically
   - You receive new notification about successful entry

## Notification Types You'll See:

### 🟢 Yard Fuel Recorded (Green)
- **When**: Yard man records fuel that successfully links to a DO
- **Action**: Informational only - entry is already linked
- **Message**: "Recorded XL for truck ABC at DAR YARD. Linked to DO 1234"

### 🟡 Truck Pending Linking (Yellow)
- **When**: Yard man records fuel but no DO exists
- **Action**: Review and either create DO or reject if incorrect
- **Message**: "Truck ABC has XL recorded at DAR YARD, but no active DO found"
- **What to do**: 
  - If truck number is correct → Create the DO
  - If truck number is wrong → Reject with reason

### Visual Indicators:

**In Notification Dropdown:**
```
┌─────────────────────────────────────┐
│ 🔔 Notifications              [X]  │
├─────────────────────────────────────┤
│ [View 3 Pending Yard Fuel Entries] │ ← YELLOW BUTTON
│  ⚠️ Trucks awaiting DO linkage     │
├─────────────────────────────────────┤
│ 🟡 Truck Pending: ABC 123          │
│    500L at DAR YARD                 │
│    No DO found - needs review       │
├─────────────────────────────────────┤
│ 🟢 Yard Fuel Recorded: ABC 124     │
│    450L at TANGA YARD               │
│    Linked to DO 1234               │
└─────────────────────────────────────┘
```

**In Pending Yard Fuel Modal:**
```
┌─────────────────────────────────────────┐
│ 🚚 Pending Yard Fuel Entries      [X] │
│    3 entries awaiting DO linkage       │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ ABC 123          [PENDING]   500L   │ │
│ │ DAR YARD • Dec 10, 2025             │ │
│ │ Entered by: John Doe                │ │
│ │                                     │ │
│ │ ⚠️ No active DO found              │ │
│ │                        [Reject]    │ │ ← CLICK HERE
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

**Rejection Modal:**
```
┌─────────────────────────────────────┐
│ Reject Entry: ABC 123              │
├─────────────────────────────────────┤
│ Rejection Reason *                 │
│ ┌─────────────────────────────────┐ │
│ │ Incorrect truck number.         │ │
│ │ Should be ABC 124 not ABC 123   │ │
│ └─────────────────────────────────┘ │
│                                     │
│ [Cancel]    [Confirm Rejection]    │
└─────────────────────────────────────┘
```

## Tips:

1. **Check regularly**: Notifications update every 30 seconds
2. **Be specific**: Provide clear rejection reasons so yard men know what to correct
3. **Common reasons**:
   - "Incorrect truck number. Should be [correct number]"
   - "Duplicate entry - already recorded"
   - "Wrong yard location"
   - "Invalid truck number format"

4. **After rejection**: Yard man will see notification immediately and can re-enter

5. **History**: All rejections are logged in the system for accountability

## Troubleshooting:

**Q: I don't see the yellow button?**
- A: No pending entries exist. All yard fuel has either been linked or rejected.

**Q: Can I undo a rejection?**
- A: No, but the yard man can simply re-enter the fuel with correct information.

**Q: What if truck number is correct but no DO?**
- A: Don't reject it. Instead, create the DO for that truck, and it will auto-link.

**Q: Can I edit a pending entry?**
- A: No, only reject or let it link when DO is created. Yard man must re-enter if wrong.

## Security:

- Only fuel order makers can reject entries
- Rejections are tracked with timestamps and usernames
- Yard men can only see their own rejections
- Full audit trail maintained in history

---

**Remember**: The rejection system is to maintain data quality. Use it when entries are clearly wrong (incorrect truck numbers, duplicates, etc.). If the truck number is correct but just missing a DO, create the DO instead of rejecting!
