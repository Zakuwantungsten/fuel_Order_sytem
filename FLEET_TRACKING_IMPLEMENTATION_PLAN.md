# Fleet Tracking Visualization - Implementation Plan

## What We're Building

A **visual route timeline** that shows where all your trucks are along the route from Mombasa/Dar → DRC destinations.

### Core Features

1. **Horizontal Route Timeline**
   ```
   MOMBASA ─── DSM ─── MOROGORO ─── MBEYA ─── TUNDUMA ─── ... ─── KOLWEZI
      🚛×3      🚛×12     🚛×8       🚛×5      🚛×15              🚛×12
   ```
   - Click any checkpoint to see trucks there
   - See going vs returning counts
   - Visual indicators for truck status

2. **Quick Copy Truck Numbers** ⭐ KEY FEATURE
   - Click a checkpoint → see all trucks there
   - **One-click copy** of truck numbers at that checkpoint
   - Paste directly into LPO creation form
   - Separate lists for going/returning trucks
   - Example output: `T139 EFP, T475 EKZ, T750 ELY, T678 ENG`

3. **Excel Report Upload**
   - Drag-and-drop your existing Excel reports
   - Automatically parses multi-table format
   - Matches truck positions to checkpoints
   - Handles both "Import Report" and "No Order" formats

4. **Flexible Checkpoint Management**
   - Add new checkpoints anywhere in the route
   - Drag-and-drop to reorder
   - System auto-adjusts all positions

5. **Smart Filtering**
   - Filter by direction (going/returning)
   - Filter by client/fleet
   - Filter by status
   - Search specific trucks

---

## System Components

### Backend (8 New Files)

1. **Models** (3 files)
   - `Checkpoint.ts` - Route checkpoints with order
   - `FleetSnapshot.ts` - Uploaded report data
   - `TruckPosition.ts` - Individual truck locations

2. **Controllers** (2 files)
   - `checkpointController.ts` - Checkpoint CRUD & reordering
   - `fleetTrackingController.ts` - Upload, parse, query positions

3. **Services** (2 files)
   - `fleetReportParser.ts` - Excel parsing logic
   - `checkpointMatcher.ts` - Fuzzy checkpoint matching

4. **Routes** (1 file)
   - `fleetTrackingRoutes.ts` - API endpoints

### Frontend (6 New Files)

1. **Components** (4 files)
   - `RouteTimeline.tsx` - Horizontal visualization
   - `TruckListPanel.tsx` - Truck details with **COPY button**
   - `CheckpointManager.tsx` - Admin checkpoint editor
   - `FileUploadZone.tsx` - Drag-and-drop uploader

2. **Pages** (1 file)
   - `FleetTracking.tsx` - Main dashboard

3. **Services** (1 file)
   - `fleetTrackingAPI.ts` - API client

---

## Key User Workflows

### Workflow 1: View Fleet Positions
```
1. Open Fleet Tracking page
2. Upload Excel report OR view latest snapshot
3. See route timeline with all trucks
4. Click checkpoint to see trucks there
```

### Workflow 2: Copy Trucks for LPO (YOUR MAIN USE CASE)
```
1. Click "MOROGORO" checkpoint
2. See trucks at MOROGORO:
   - Going (5 trucks): T139 EFP, T475 EKZ, ...
   - Returning (3 trucks): T213 EHE, T198 EHE, ...
3. Click "Copy Going Trucks" button
4. Truck numbers copied to clipboard
5. Go to LPO creation page
6. Paste truck numbers into form
7. System auto-fills all trucks
```

### Workflow 3: Add New Checkpoint
```
1. Admin opens Checkpoint Manager
2. Click "Add Checkpoint"
3. Enter name: "NEW CHECKPOINT"
4. Choose position: "Insert after MOROGORO"
5. System auto-reorders: MOROGORO (23) → NEW (24) → DOMA (25)
6. Done! Future reports will use new checkpoint
```

---

## API Endpoints

### Checkpoints
- `GET /api/checkpoints` - List all checkpoints (ordered)
- `POST /api/checkpoints` - Create new checkpoint
- `PUT /api/checkpoints/:id` - Update checkpoint
- `PUT /api/checkpoints/reorder` - Bulk reorder
- `POST /api/checkpoints/seed` - Seed initial 58 checkpoints

### Fleet Tracking
- `POST /api/fleet-tracking/upload` - Upload Excel report
- `GET /api/fleet-tracking/latest` - Get latest snapshot
- `GET /api/fleet-tracking/positions` - Get truck positions (with filters)
- `GET /api/fleet-tracking/checkpoint/:name` - Get trucks at specific checkpoint
- `GET /api/fleet-tracking/checkpoint/:name/copy` - Get formatted truck list for copying

---

## Database Schema (Simplified)

### Checkpoint
```typescript
{
  name: "MOROGORO",
  order: 23,
  region: "TANZANIA_INTERIOR",
  isActive: true,
  isMajor: true  // fuel station or border
}
```

### FleetSnapshot
```typescript
{
  timestamp: "2026-01-23T10:00:00Z",
  reportType: "IMPORT",
  fileName: "IMPORT_REPORT JAN 2026.csv",
  fleetGroups: [
    {
      name: "BRIDGE 1043MT MBSA-KOLWEZI",
      trucks: [...truckPositions]
    }
  ]
}
```

### TruckPosition
```typescript
{
  truckNo: "T139 EFP",
  trailerNo: "T610 EGS",
  currentCheckpoint: "MOROGORO",
  status: "ENROUTE COMICKA",
  direction: "GOING",
  fleetGroup: "BRIDGE 1043MT MBSA-KOLWEZI",
  daysInJourney: 10
}
```

---

## Copy Feature Details (Main Request)

### Copy Button Options

When you click a checkpoint, you see:

```
┌─────────────────────────────────────────────────────────┐
│ MOROGORO - 8 trucks                                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ Going Trucks (5)                  [Copy Going] [Copy All]│
│ • T139 EFP / T610 EGS - ENROUTE COMICKA                 │
│ • T475 EKZ / T703 ELK - TO LOAD                         │
│ • T750 ELY / T627 EMF - ENROUTE KOLWEZI                 │
│ • T678 ENG / T848 EM  - WAITING TO LOAD                 │
│ • T457 EAG / T927 DZS - ENROUTE LIKASI                  │
│                                                          │
│ Returning Trucks (3)              [Copy Return] [Copy All]│
│ • T213 EHE / T466 EGT - ENROUTE DAR                     │
│ • T198 EHE / T528 EGT - WAITING TO OFFLOAD              │
│ • T221 ELV / T617 EMF - ENROUTE DAR                     │
│                                                          │
│ [Copy All 8 Trucks] [Export Excel]                      │
└─────────────────────────────────────────────────────────┘
```

### Copy Format Options

**Option 1: Comma-separated (default)**
```
T139 EFP, T475 EKZ, T750 ELY, T678 ENG, T457 EAG
```

**Option 2: Line-separated**
```
T139 EFP
T475 EKZ
T750 ELY
T678 ENG
T457 EAG
```

**Option 3: With Details**
```
T139 EFP (GOING, ENROUTE COMICKA)
T475 EKZ (GOING, TO LOAD)
...
```

**You choose the format** via settings or dropdown.

---

## Integration with LPO System

### Seamless Workflow

1. **From Fleet Tracking:**
   - Click checkpoint
   - Click "Copy Going Trucks"
   - Trucks copied: `T139 EFP, T475 EKZ, T750 ELY`

2. **To LPO Creation:**
   - Open LPO Detail Form
   - New **"Paste Trucks"** button
   - Click → Auto-creates entries for all trucks
   - Each truck gets looked up automatically
   - Fuel records fetched
   - Ready to set liters and save

3. **Smart Features:**
   - Validates truck numbers
   - Warns if truck not found
   - Shows which trucks already have LPOs
   - Highlights duplicates

---

## Timeline

- **Week 1:** Database models + Backend APIs
- **Week 2:** Frontend components + Route visualization
- **Week 3:** Copy feature + LPO integration
- **Week 4:** Testing + Admin checkpoint manager

---

## Success Criteria

✅ Upload Excel report → See all trucks on route  
✅ Click checkpoint → See truck list  
✅ Click "Copy" → Truck numbers in clipboard  
✅ Paste in LPO → All trucks added instantly  
✅ Add checkpoint → Appears in route immediately  
✅ Handles 300+ trucks smoothly  
✅ Works on mobile devices  

---

## Next Steps

1. ✅ Approve this plan
2. 🏗️ Start building (I'll begin now!)
3. 🧪 Test with your real Excel files
4. 🚀 Deploy and use

**Ready to build!** 🚀
