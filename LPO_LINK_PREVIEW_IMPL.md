# LPO Link Preview Feature — Implementation Details

## Overview

This document describes the full implementation of the **auto-link preview** and **manual-link preview** features added to the Dar and Tanga LPO sheet views. The goal was to intercept both linking flows with a confirmation preview before any fuel record writes occur.

---

## What Changed

### Before
- **Manual link**: User enters DO number → clicks Link → backend links immediately with no preview.
- **Auto-link**: User selects rows → clicks Auto-Link → backend links immediately, only pausing on conflicts (existing yard value).

### After
- **Manual link**: User enters DO number → clicks Search → backend finds the fuel record (dry-run) → frontend shows a preview card with the matched record details + eye icon to inspect full breakdown → user clicks Confirm Link → backend writes the link.
- **Auto-link**: User selects rows → clicks Auto-Link → backend does a dry-run preview for all selected entries → frontend shows a full preview modal with all matched + not-found entries, per-row checkboxes and eye icons → user adjusts and confirms → backend writes the links.

---

## Backend Changes

### New Endpoints (×2 controllers, ×2 routes each)

#### `POST /dar-lpo/preview-manual-link`
**Controller:** `previewManualLinkDarEntry`  
**Behavior:** Finds the FuelRecord matching the given `doNo + truckNo` without writing anything. Returns the full fuel record object for the frontend to display.  
**Auth:** `WRITE_ROLES` (same as manual-link)

#### `POST /dar-lpo/:id/preview-bulk-link`
**Controller:** `previewBulkAutoLinkDarEntries`  
**Behavior:** Iterates all `entryIds`, applies the same time-gate logic as `bulkAutoLinkDarEntries`, finds matching FuelRecords, but **never writes**. Returns a `results` array where each item has:
- `status`: `'found'` | `'conflict'` | `'not_found'`
- `fuelRecord`: full FuelRecord object (or `null` if not found)
- `existingValue`: current `darYard` value on the matched record

Identical endpoints exist for Tanga (`/tanga-lpo/preview-manual-link`, `/tanga-lpo/:id/preview-bulk-link`).

### File Locations
```
backend/src/controllers/darLPOController.ts    — appended at end
backend/src/controllers/tangaLPOController.ts  — appended at end
backend/src/routes/darLPORoutes.ts             — added before /:id/bulk-link
backend/src/routes/tangaLPORoutes.ts           — added before /:id/bulk-link
```

---

## Frontend API Changes

**File:** `frontend/src/services/api.ts`

Added to both `darLPOAPI` and `tangaLPOAPI`:

```ts
previewManualLink: async (data: { lpoId, entryId, doNo }) =>
  POST /dar-lpo/preview-manual-link  →  returns { fuelRecord }

previewBulkLink: async (lpoId, { entryIds }) =>
  POST /dar-lpo/:id/preview-bulk-link  →  returns { results[] }
```

---

## Frontend Component Changes

### DarLPOSheetView.tsx

#### New Types
```ts
type BulkPreviewResult = {
  entryId: string;
  status: 'found' | 'conflict' | 'not_found';
  truckNo: string;
  doNo: string;
  liters: number;
  existingValue: number;
  fuelRecord: any | null;
};
```

#### New Imports
- `Eye` from lucide-react
- `FuelRecordInspectModal` from `./FuelRecordInspectModal`

#### ManualLinkModal — 2-step flow
State inside modal:
- `step: 'input' | 'preview'`
- `searching: boolean`
- `previewRecord: any | null`
- `inspectFrId: string | null`

Step 1 — Input: same DO number input field, but submit now calls `darLPOAPI.previewManualLink` and advances to step 2.  
Step 2 — Preview: shows a card with the matched record (truck, date, going/return DO, balance, current darYard value, top-up warning if darYard > 0) plus an eye icon (🔍) to open `FuelRecordInspectModal`. Confirm button calls the real `darLPOAPI.manualLink`.

#### New Component: BulkLinkPreviewModal
Props: `results: BulkPreviewResult[], onConfirm(selectedIds, topUpIds), onClose`

Shows two sections:
1. **Matched** — each entry as a checkable row (default: all checked). Conflict entries shown in amber with top-up math. Eye icon on each row to inspect the full fuel record.
2. **Not Found** — read-only list, no checkbox.

Select-all checkbox in the Matched header.  
Confirm button passes `selectedIds` (all checked) and `topUpIds` (subset that are conflicts) to the actual `handleBulkLink`.

#### New State in Main Component
```ts
const [showBulkPreview, setShowBulkPreview] = useState(false);
const [bulkPreviewResults, setBulkPreviewResults] = useState<BulkPreviewResult[]>([]);
```

#### New Function: handlePreviewBulkLink
Calls `darLPOAPI.previewBulkLink`, stores results, opens `BulkLinkPreviewModal`. Both the desktop and mobile Auto-Link buttons now call this instead of `handleBulkLink` directly.

`handleBulkLink` is unchanged — it's now called from the preview modal's confirm callback.

---

### TangaLPOSheetView.tsx

This file had **no bulk-link infrastructure** (no selectedIds, no auto-link button, no mobile bulk bar, no BulkLinkConflictModal). The full feature was added from scratch:

#### Added (same as Dar but in Tanga blue theme):
- `Eye`, `Check` imports + `FuelRecordInspectModal`
- `BulkLinkResult` + `BulkPreviewResult` types
- `BulkLinkConflictModal` component
- `ManualLinkModal` rewritten with 2-step flow (amber accent for Tanga)
- `BulkLinkPreviewModal` component (blue accent)
- Bulk-link state: `selectedIds`, `bulkLinking`, `bulkConflicts`, `showBulkConflict`, `showBulkPreview`, `bulkPreviewResults`
- `unlinkableEntries`, `allUnlinkedSelected` computed values
- `toggleEntry`, `toggleSelectAll`, `handlePreviewBulkLink`, `handleBulkLink` functions
- `hasSelection` boolean

#### UI additions:
- **Mobile bulk-link bar** (green-50/blue tint, appears when there are unlinked entries)
- **Per-row checkboxes** in mobile cards (only for selectable entries)
- **Checkbox column** added to desktop table (grid updated from 8 to 9 columns)
- **Per-row checkboxes** in desktop table rows
- **Auto-Link button** in desktop header (appears when `hasSelection`)
- **Modal renders**: `BulkLinkPreviewModal`, `BulkLinkConflictModal`

---

## Flow Diagrams

### Manual Link (new)
```
Click Link icon
  → ManualLinkModal opens (step: input)
  → User types DO number → clicks Search
  → darLPOAPI.previewManualLink()  [no DB write]
  → Step changes to 'preview'
  → Shows matched fuel record card
  → User clicks eye icon → FuelRecordInspectModal opens
  → User clicks Confirm Link
  → darLPOAPI.manualLink()  [writes to DB]
  → Toast + LPO state updated
```

### Auto-Link (new)
```
User checks entries → clicks Auto-Link (N)
  → handlePreviewBulkLink()
  → darLPOAPI.previewBulkLink()  [no DB write]
  → BulkLinkPreviewModal opens
  → Shows: Matched (found/conflict) + Not Found
  → User deselects any rows, clicks eye icons
  → User clicks Link (N)
  → handleBulkLink(selectedIds, topUpIds)
  → darLPOAPI.bulkLink()  [writes to DB]
  → If backend returns conflicts → BulkLinkConflictModal (top-up confirm)
  → Toast + LPO state updated
```

---

## Eye Icon Behavior

The `FuelRecordInspectModal` component (`FuelRecordInspectModal.tsx`) fetches the full fuel record by ID from the API when opened. It is not embedded in the sheet view rows — it is only accessible from:
1. The Manual Link preview card (step 2)
2. Each matched row in the Auto-Link preview modal

It renders as a z-[80] overlay above the z-[70] preview modal.

---

## Files Modified

| File | Change |
|------|--------|
| `backend/src/controllers/darLPOController.ts` | +2 new export functions at end |
| `backend/src/controllers/tangaLPOController.ts` | +2 new export functions at end |
| `backend/src/routes/darLPORoutes.ts` | +2 new routes |
| `backend/src/routes/tangaLPORoutes.ts` | +2 new routes |
| `frontend/src/services/api.ts` | +2 methods to darLPOAPI, +2 methods to tangaLPOAPI |
| `frontend/src/components/DarLPOSheetView.tsx` | ManualLinkModal rewritten, BulkLinkPreviewModal added, state/handlers updated |
| `frontend/src/components/TangaLPOSheetView.tsx` | Full bulk-link infrastructure added + ManualLinkModal rewritten + preview modals added |
