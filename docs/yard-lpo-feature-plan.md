# Yard LPO Feature Plan — Tanga & Dar Independent LPO Systems

## Business Requirement

Fuel dispensed at **Tanga Yard** and **Dar Yard** on any given day must be backed by
a formal purchase order (LPO) that is specific to that yard — not a freeform dispense
log entry. That yard LPO must then automatically populate the corresponding column
(`tangaYard` or `darYard`) on the truck's main Fuel Record, exactly the way the main
Mombasa LPO populates checkpoint columns (darGoing, moroGoing, etc.) on that record.

Each yard also needs its own management interface: a dashboard, a workbook (year→month→
LPO tabs), individual sheet views, and a list/filter view — so Tanga staff work entirely
inside a Tanga-scoped UI, and Dar staff work inside a Dar-scoped UI, without touching
the main Mombasa LPO screen.

---

## How the Current System Works (Context)

### Main LPO → FuelRecord Flow

1. Clerk creates an LPO (`LPOSummary`) for a fuel station (e.g. "GBP MOROGORO").
2. Each LPO detail entry carries: `doNo`, `truckNo`, `liters`, `rate`, `amount`, `dest`.
3. `lpoSummaryController.createLPOSummary()` — after saving — walks each entry, finds
   the matching `FuelRecord` by `truckNo` + `doNo` (going or return), and writes
   `liters` into the correct checkpoint field (moroGoing, darGoing, tangaReturn, etc.)
   using the station's `fuelRecordFieldGoing` / `fuelRecordFieldReturning` mapping from
   `FuelStationConfig`.
4. Balance is recalculated: `balance = (totalLts + extra) − Σ(all checkpoint fields)`.

### Current Yard Fuel Flow (No LPO — just dispense logs)

1. Yard personnel open **YardFuel** page, enter truck + liters.
2. A `YardFuelDispense` document is created.
3. The system tries to auto-link it to an active `FuelRecord`.
4. If successful, it writes liters into `tangaYard` or `darYard` on that `FuelRecord`.
5. If the link fails, a supervisor manually links or rejects it.

### What Is Missing

- No formal purchase order document backs the yard's daily fuel output.
- There is no workbook, no LPO number, no approval trail, no monthly summary for Tanga
  or Dar yard fuel as a standalone procurement document.
- `tangaYard` and `darYard` columns in `FuelRecord` are currently populated by the
  loose dispense-log flow, not an authoritative LPO.

---

## Target State

| Yard | LPO Collection | FuelRecord field written | UI Section |
|------|---------------|--------------------------|------------|
| Mombasa (unchanged) | `lposummaries` | mmsaYard ← via YardFuelDispense (unchanged) | Existing LPOs page |
| **Tanga** | `tangalpodocuments` (new) | **tangaYard** | New Tanga LPO pages |
| **Dar** | `darlpodocuments` (new) | **darYard** | New Dar LPO pages |

> Mombasa stays exactly as it is. Only Tanga and Dar get the new system.

---

## Part 1 — Backend

### 1.1 New Mongoose Models

#### `TangaLPODocument` — `backend/src/models/TangaLPODocument.ts`

This mirrors `LPOSummary` with yard-specific simplifications:

```
Collection name: tangalpodocuments
```

**Schema fields:**

| Field | Type | Notes |
|-------|------|-------|
| `lpoNo` | String, unique | Auto-generated: "TY-2026-001", "TY-2026-002", … |
| `date` | String | "YYYY-MM-DD" |
| `year` | Number | Extracted from date on pre-save hook |
| `entries` | Array of TangaLPOEntry (embedded) | See sub-schema below |
| `total` | Number | Sum of all entry amounts; recalculated on pre-save |
| `currency` | String enum: 'TZS' \| 'USD' | Default 'TZS' |
| `createdBy` | String | Username of the staff who created it |
| `approvedBy` | String | Username of approver |
| `isDeleted` | Boolean | Soft-delete; default false |
| `deletedAt` | Date | Set when isDeleted flips |
| `notes` | String | Optional daily notes / remarks |

**TangaLPOEntry sub-schema (embedded array):**

| Field | Type | Notes |
|-------|------|-------|
| `doNo` | String, required | Delivery order number |
| `truckNo` | String, required | Truck plate number |
| `liters` | Number, required | Litres dispensed |
| `rate` | Number, required | Price per litre (TZS or USD) |
| `amount` | Number, required | liters × rate |
| `dest` | String, required | Destination of the truck |
| `sortOrder` | Number | For row ordering inside the sheet |
| `originalLiters` | Number \| null | Populated when entry is amended |
| `amendedAt` | Date \| null | Timestamp of amendment |
| `isCancelled` | Boolean | Default false |
| `cancellationReason` | String | Reason text |
| `cancelledAt` | Date | Timestamp |
| `linkedFuelRecordId` | String | ObjectId of the FuelRecord this entry updated |

**Indexes:**
- `lpoNo` (unique, already from schema)
- `date: 1`
- `year: 1`
- `isDeleted: 1`
- Compound: `{ year: 1, isDeleted: 1 }`
- Compound: `{ isDeleted: 1, date: -1 }`

**Pre-save hook:**
- Recalculate `total = Σ entries[i].amount`
- Extract `year` from `date` if not set

---

#### `DarLPODocument` — `backend/src/models/DarLPODocument.ts`

Identical structure to `TangaLPODocument` with:

```
Collection name: darlpodocuments
lpoNo prefix: "DY-2026-001", "DY-2026-002", …
```

All fields and indexes are the same. Two separate models (not one shared model with a
`yard` discriminator) so each collection can be managed, backed up, and queried
independently without risk of cross-yard data leaking.

---

### 1.2 New Controllers

#### `backend/src/controllers/tangaLPOController.ts`

Exports an object with these methods:

| Method | Description |
|--------|-------------|
| `createTangaLPO` | Create a new Tanga LPO; on success, for each entry find the matching `FuelRecord` by `truckNo` + `doNo` and write `liters` into `tangaYard`; recalculate `balance` |
| `getAllTangaLPOs` | Paginated list (filters: year, date range, lpoNo search) |
| `getTangaLPOById` | Single LPO by MongoDB id |
| `getTangaLPOByLPONo` | Single LPO by `lpoNo` string |
| `updateTangaLPO` | Update LPO entries; diff old vs. new liters and patch `tangaYard` delta on affected `FuelRecord`s |
| `cancelEntryInTangaLPO` | Set entry `isCancelled = true`; subtract entry liters from `tangaYard` on the linked `FuelRecord`; recalculate balance |
| `cancelAllEntriesInTangaLPO` | Cancel all entries; reverse all `tangaYard` writes |
| `amendEntryInTangaLPO` | Reduce liters on an entry; store old value in `originalLiters`; patch the delta on `tangaYard` |
| `getNextTangaLPONumber` | Returns the next sequential `lpoNo` ("TY-{year}-{padded seq}") |
| `getTangaWorkbookByYear` | Returns all Tanga LPOs for a given year, grouped by month (for workbook view) |
| `getTangaAvailableYears` | Returns sorted list of years that have Tanga LPOs |

**FuelRecord write logic inside `createTangaLPO`:**

```
For each entry in payload.entries:
  1. Find FuelRecord where:
       (goingDo === entry.doNo OR returnDo === entry.doNo)
       AND truckNo === entry.truckNo
       AND isDeleted === false
  2. If found:
       fuelRecord.tangaYard += entry.liters
       fuelRecord.balance   = (fuelRecord.totalLts + fuelRecord.extra)
                              − Σ(all checkpoint fields including new tangaYard)
       entry.linkedFuelRecordId = fuelRecord._id
       await fuelRecord.save()
  3. Emit WebSocket event: 'fuelRecord:updated' with the patched record
```

This is the same sequential read-modify-write pattern used in `lpoSummaryController`
(see `Fuel update batch invariant` memory note — never use `$inc` here).

---

#### `backend/src/controllers/darLPOController.ts`

Identical structure to `tangaLPOController` but:
- Uses `DarLPODocument` model
- Writes to `darYard` instead of `tangaYard`
- `lpoNo` prefix is `DY-`
- All method names prefixed with `dar` instead of `tanga`

---

### 1.3 New Route Files

#### `backend/src/routes/tangaLPORoutes.ts`

```
Base path (registered in routes/index.ts): /api/v1/tanga-lpo
```

| Method | Path | Auth roles | Controller method |
|--------|------|-----------|-------------------|
| GET | `/` | all authenticated | `getAllTangaLPOs` |
| GET | `/next-number` | all authenticated | `getNextTangaLPONumber` |
| GET | `/workbooks/:year` | all authenticated | `getTangaWorkbookByYear` |
| GET | `/years` | all authenticated | `getTangaAvailableYears` |
| GET | `/lpo/:lpoNo` | all authenticated | `getTangaLPOByLPONo` |
| GET | `/:id` | all authenticated | `getTangaLPOById` |
| POST | `/` | super_admin, admin, manager, supervisor, tanga_yard | `createTangaLPO` |
| PUT | `/:id` | super_admin, admin, manager, supervisor, tanga_yard | `updateTangaLPO` |
| POST | `/cancel-entry` | super_admin, admin, manager, supervisor, tanga_yard | `cancelEntryInTangaLPO` |
| POST | `/amend-entry` | super_admin, admin, manager, supervisor, tanga_yard | `amendEntryInTangaLPO` |
| POST | `/:id/cancel-all` | super_admin, admin, manager, supervisor, tanga_yard | `cancelAllEntriesInTangaLPO` |
| POST | `/:id/lock` | super_admin, admin, manager, supervisor, tanga_yard | acquire edit lock |
| DELETE | `/:id/lock` | super_admin, admin, manager, supervisor, tanga_yard | release edit lock |

#### `backend/src/routes/darLPORoutes.ts`

```
Base path: /api/v1/dar-lpo
```

Same route table but roles include `dar_yard` instead of `tanga_yard`, and all
controller methods point to `darLPOController`.

---

### 1.4 Register Routes in Index

File: `backend/src/routes/index.ts`

Add two lines in the route registration block:

```typescript
import tangaLPORoutes from './tangaLPORoutes';
import darLPORoutes   from './darLPORoutes';

// inside the router setup:
router.use('/tanga-lpo', tangaLPORoutes);
router.use('/dar-lpo',   darLPORoutes);
```

---

### 1.5 LPO Number Auto-Generation

`getNextTangaLPONumber` implementation:

```
prefix = "TY"
year   = current year

lastLPO = TangaLPODocument
  .findOne({ lpoNo: /^TY-{year}-/ })
  .sort({ lpoNo: -1 })

if lastLPO:
  seq = parseInt(lastLPO.lpoNo.split('-')[2]) + 1
else:
  seq = 1

return `TY-${year}-${String(seq).padStart(3, '0')}`
```

Same logic for Dar (`DY-` prefix, `DarLPODocument`).

---

### 1.6 TypeScript Types

File: `backend/src/types/index.ts` — add:

```typescript
export interface ITangaLPOEntry {
  _id?: string;
  doNo: string;
  truckNo: string;
  liters: number;
  rate: number;
  amount: number;
  dest: string;
  sortOrder?: number;
  originalLiters?: number | null;
  amendedAt?: Date | null;
  isCancelled: boolean;
  cancellationReason?: string;
  cancelledAt?: Date;
  linkedFuelRecordId?: string;
}

export interface ITangaLPODocument {
  _id?: string;
  lpoNo: string;
  date: string;
  year: number;
  entries: ITangaLPOEntry[];
  total: number;
  currency: 'TZS' | 'USD';
  createdBy?: string;
  approvedBy?: string;
  notes?: string;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

// IDarLPOEntry and IDarLPODocument — identical structure, separate types
export interface IDarLPOEntry extends ITangaLPOEntry {}
export interface IDarLPODocument extends Omit<ITangaLPODocument, 'lpoNo'> {
  lpoNo: string; // "DY-YYYY-NNN"
}
```

---

## Part 2 — Frontend

### 2.1 New API Service Functions

File: `frontend/src/services/api.ts` — add two new API objects (same pattern as
`lpoDocumentsAPI`):

```typescript
export const tangaLPOAPI = {
  getAll:           (params) => api.get('/tanga-lpo', { params }),
  getById:          (id)     => api.get(`/tanga-lpo/${id}`),
  getByLPONo:       (lpoNo)  => api.get(`/tanga-lpo/lpo/${lpoNo}`),
  getWorkbookYear:  (year)   => api.get(`/tanga-lpo/workbooks/${year}`),
  getYears:         ()       => api.get('/tanga-lpo/years'),
  getNextNumber:    ()       => api.get('/tanga-lpo/next-number'),
  create:           (data)   => api.post('/tanga-lpo', data),
  update:           (id, d)  => api.put(`/tanga-lpo/${id}`, d),
  cancelEntry:      (data)   => api.post('/tanga-lpo/cancel-entry', data),
  amendEntry:       (data)   => api.post('/tanga-lpo/amend-entry', data),
  cancelAll:        (id)     => api.post(`/tanga-lpo/${id}/cancel-all`),
  acquireLock:      (id)     => api.post(`/tanga-lpo/${id}/lock`),
  releaseLock:      (id)     => api.delete(`/tanga-lpo/${id}/lock`),
};

export const darLPOAPI = {
  // identical shape, base path '/dar-lpo'
};
```

---

### 2.2 New React Query Hooks

File: `frontend/src/hooks/useTangaLPOs.ts` (new file)
File: `frontend/src/hooks/useDarLPOs.ts` (new file)

Each mirrors the pattern in `frontend/src/hooks/useLPOs.ts`:

```typescript
// useTangaLPOs.ts — key functions:
export const useTangaLPOList    = (params) => useQuery([...])
export const useTangaWorkbook   = (year)   => useQuery([...])
export const useTangaYears      = ()       => useQuery([...])
export const useTangaNextNumber = ()       => useQuery([...])
```

Same file for Dar (`useDarLPOs.ts`).

---

### 2.3 New TypeScript Frontend Types

File: `frontend/src/types/index.ts` (or wherever frontend types live) — add:

```typescript
export interface TangaLPOEntry {
  _id?: string;
  doNo: string;
  truckNo: string;
  liters: number;
  rate: number;
  amount: number;
  dest: string;
  sortOrder?: number;
  originalLiters?: number | null;
  isCancelled: boolean;
  cancellationReason?: string;
  linkedFuelRecordId?: string;
}

export interface TangaLPO {
  id: string;
  lpoNo: string;
  date: string;
  year: number;
  entries: TangaLPOEntry[];
  total: number;
  currency: 'TZS' | 'USD';
  createdBy?: string;
  approvedBy?: string;
  notes?: string;
  isDeleted: boolean;
  editLock?: EditLock; // populated at read-time from EditLock collection
}

// DarLPOEntry, DarLPO — same shape
```

---

### 2.4 New Pages

#### `frontend/src/pages/TangaLPOs.tsx`

The main page for Tanga Yard LPO management. Mirrors `frontend/src/pages/LPOs.tsx`
in structure with these view modes:

| View Mode | Description |
|-----------|-------------|
| **Workbook** | Year-based workbook with month tabs; each tab is a day's LPO |
| **List** | Paginated, filterable table of all Tanga LPOs |
| **Summary** | Monthly aggregations: total LPOs, total liters, total TZS, truck count |

State it manages (same pattern as LPOs.tsx):
- `selectedYear` (persisted in localStorage under `tanga-lpo:selectedYear`)
- `viewMode`: `'workbook' | 'list' | 'summary'`
- `dateFilter`, `searchTerm` (for list view)
- `selectedPeriods` (for list filter by month/year)

Access control: visible to roles `tanga_yard`, `super_admin`, `admin`, `manager`,
`supervisor`. (Use existing `PermissionGuard` or role check from `useAuth`.)

---

#### `frontend/src/pages/DarLPOs.tsx`

Identical to `TangaLPOs.tsx` but:
- Uses `darLPOAPI` and `useDarLPOs` hooks
- localStorage key prefix `dar-lpo:`
- Visible to roles `dar_yard`, `super_admin`, `admin`, `manager`, `supervisor`
- Colors/branding can use a different accent (e.g. Tanga = blue, Dar = green)

---

### 2.5 New Components

#### `frontend/src/components/TangaLPOWorkbook.tsx`

Mirrors `LPOWorkbook.tsx`. Displays a year's worth of Tanga LPOs in a tabbed
spreadsheet interface.

Structure:
```
TangaLPOWorkbook
├── Year selector (dropdown)
├── Month tabs (Jan–Dec)
│   └── Per-month list of LPO tabs (day LPOs for that month)
│       Each tab shows: lpoNo, date, truck count, total liters, total amount
└── Pagination for month tab pages (8 tabs per page, same as LPOWorkbook)
```

On click of a tab → opens `TangaLPOSheetView` for that LPO.

Realtime sync: subscribes to WebSocket events `tangaLPO:created`,
`tangaLPO:updated` (add these event names to the WebSocket server's emit calls in the
controller).

---

#### `frontend/src/components/TangaLPOSheetView.tsx`

The per-LPO editor. Mirrors `LPOSheetView.tsx` with a simplified column set:

| Column | Field |
|--------|-------|
| # | Row number |
| DO No | doNo |
| Truck No | truckNo |
| Liters | liters |
| Rate | rate |
| Amount | amount (auto: liters × rate) |
| Destination | dest |
| Status | isCancelled badge |
| Actions | Edit / Cancel / Amend row |

Features:
- **Add row** button → opens `TangaLPOEntryForm` modal
- **Edit row** → inline edit or modal
- **Cancel entry** → sets isCancelled, reverses `tangaYard` on linked FuelRecord
- **Amend entry** → reduce liters, store original
- **Edit lock** — acquire/release lock to prevent concurrent edits (reuse existing
  `lockService`)
- **Copy to clipboard** (text format) — lpoNo, date, entries list
- **Export PDF** — same pattern as `LPOPrint.tsx`
- **Cancel all** button at sheet header
- Shows total liters and total amount in a footer row

---

#### `frontend/src/components/TangaLPOEntryForm.tsx`

Modal form for adding/editing a single entry. Fields:
- DO Number (text input)
- Truck Number (text input)
- Liters (number input)
- Rate (number input, pre-filled from last used rate or config)
- Destination (text input)

On submit calls `tangaLPOAPI.create` or `tangaLPOAPI.update`.

---

#### `frontend/src/components/TangaLPOForm.tsx`

The form for creating a brand-new Tanga LPO document. Fields:
- Date (date picker, defaults to today)
- Currency selector (TZS / USD)
- Notes (optional textarea)
- Entries section (same as `TangaLPOEntryForm` but multi-row)
- LPO Number (auto-populated from `getNextTangaLPONumber`, read-only, shown for
  confirmation)

---

#### `frontend/src/components/TangaLPOSummary.tsx`

Monthly summary component for Tanga. Renders a table:

| Month | # LPOs | Total Trucks | Total Liters | Total Amount (TZS) |
|-------|--------|-------------|-------------|-------------------|
| January 2026 | 5 | 23 | 14,500 | 23,200,000 |
| … | | | | |

Data comes from `useTangaLPOList` with `groupBy=month` or a dedicated summary
endpoint.

---

#### Dar equivalents

All four Tanga components have Dar equivalents:
- `DarLPOWorkbook.tsx`
- `DarLPOSheetView.tsx`
- `DarLPOEntryForm.tsx`
- `DarLPOForm.tsx`
- `DarLPOSummary.tsx`

These are separate files (not shared/parameterised) to avoid a messy generic component
that makes both yards harder to maintain independently.

---

### 2.6 Routing

File: `frontend/src/App.tsx` (or wherever routes are declared)

Add two new protected routes:

```tsx
<Route path="/tanga-lpo" element={<TangaLPOs />} />
<Route path="/dar-lpo"   element={<DarLPOs />}   />
```

Wrap each with the same `ProtectedRoute`/`PermissionGuard` used for the existing
`/lpos` route.

---

### 2.7 Navigation / Sidebar

File: wherever the sidebar/nav links are declared (likely `Sidebar.tsx` or a nav
config file).

Add two new nav items under a **"Yard Operations"** group (or similar):

```
├── Yard Operations
│   ├── Tanga LPO           → /tanga-lpo   (visible to tanga_yard + admin roles)
│   └── Dar LPO             → /dar-lpo     (visible to dar_yard + admin roles)
```

Use role-based visibility (same pattern as other sidebar items) so:
- `tanga_yard` users see only "Tanga LPO"
- `dar_yard` users see only "Dar LPO"
- `super_admin`, `admin`, `manager` see both

---

## Part 3 — FuelRecord Write Logic (How the LPO Feeds the Column)

This is the critical link. When a Tanga or Dar LPO entry is created, the backend must
update the corresponding FuelRecord column.

### 3.1 FuelRecord Matching Strategy

When creating a `TangaLPODocument` entry with `doNo` + `truckNo`:

```
FuelRecord.findOne({
  truckNo: entry.truckNo,
  $or: [
    { goingDo: entry.doNo },
    { returnDo: entry.doNo }
  ],
  isDeleted: false,
  isCancelled: { $ne: true }
})
```

If exactly one record is found → proceed.
If none found → save the LPO entry anyway (it remains unlinked); emit a warning to
the frontend; do NOT block LPO creation.
If multiple found → pick the most recent by `date`.

### 3.2 Field Write

For Tanga:
```
fuelRecord.tangaYard += entry.liters
```

For Dar:
```
fuelRecord.darYard += entry.liters
```

Then recalculate balance (sequential, not $inc — per existing batch invariant):
```
fuelRecord.balance =
  (fuelRecord.totalLts ?? 0) +
  (fuelRecord.extra    ?? 0) -
  (fuelRecord.mmsaYard   + fuelRecord.tangaYard  + fuelRecord.darYard  +
   fuelRecord.tangaGoing + fuelRecord.darGoing   + fuelRecord.moroGoing +
   fuelRecord.mbeyaGoing + fuelRecord.tdmGoing   + fuelRecord.zambiaGoing +
   fuelRecord.congoFuel  + fuelRecord.zambiaReturn + fuelRecord.tundumaReturn +
   fuelRecord.mbeyaReturn + fuelRecord.moroReturn + fuelRecord.darReturn +
   fuelRecord.tangaReturn)
```

### 3.3 Cancellation / Amendment Reversal

**On cancel entry:**
```
fuelRecord.tangaYard -= entry.liters   // or darYard for Dar
// recalculate balance
```

**On amend entry** (reduce from X to Y liters):
```
delta = X - Y
fuelRecord.tangaYard -= delta
// recalculate balance
```

**On cancel-all:**
Loop all non-cancelled entries and reverse each.

### 3.4 Concurrency Safety

Same rule as main LPO controller: always read the full FuelRecord document first, modify
the field in-process, then call `fuelRecord.save()`. Never use `$inc` or parallel
`findOneAndUpdate` calls on the same record within the same request.

---

## Part 4 — WebSocket Events

The WebSocket server (likely `backend/src/services/websocketService.ts` or similar)
should emit these events when yard LPO mutations happen:

| Event | Payload | When |
|-------|---------|------|
| `tangaLPO:created` | `{ lpoId, lpoNo, year, month }` | After createTangaLPO succeeds |
| `tangaLPO:updated` | `{ lpoId, lpoNo }` | After updateTangaLPO succeeds |
| `darLPO:created`   | `{ lpoId, lpoNo, year, month }` | After createDarLPO succeeds |
| `darLPO:updated`   | `{ lpoId, lpoNo }` | After updateDarLPO succeeds |
| `fuelRecord:updated` | existing event | Already emitted when FuelRecord is patched |

The frontend workbook components subscribe to these to trigger React Query cache
invalidation.

---

## Part 5 — Dashboard Views

### 5.1 Tanga LPO Dashboard

A stats/summary panel at the top of `TangaLPOs.tsx` (shown in all view modes):

| Stat Card | Value |
|-----------|-------|
| LPOs This Month | count of Tanga LPOs for current month |
| Total Liters This Month | sum of all entry liters this month |
| Total Amount This Month | sum of all entry amounts this month |
| Trucks Served This Month | distinct truck count |
| Unlinked Entries | count of entries where `linkedFuelRecordId` is null |

The "Unlinked Entries" card is an action item — clicking it filters the list to show
only LPO entries that could not be auto-linked to a FuelRecord, so a supervisor can
investigate.

### 5.2 Dar LPO Dashboard

Identical structure to Tanga dashboard, using Dar data.

---

## Part 6 — Permissions Summary

### Existing roles used (no new roles needed)

| Role | Access |
|------|--------|
| `tanga_yard` | Create/edit Tanga LPOs; view Tanga dashboard; no Dar access |
| `dar_yard` | Create/edit Dar LPOs; view Dar dashboard; no Tanga access |
| `super_admin`, `admin` | Full access to both Tanga and Dar |
| `manager`, `super_manager` | Read access to both; create/edit if authorized on route |
| `supervisor` | Create/edit both (same as current LPO supervisor access) |

The `tanga_yard` and `dar_yard` roles already exist in `backend/src/types/index.ts`
as `UserRole` values. No schema changes needed for roles.

---

## Part 7 — Edit Lock Integration

Both `TangaLPOSheetView` and `DarLPOSheetView` reuse the existing `EditLock`
collection via `createEditLockHandlers(TangaLPODocument, 'tanga_lpo_documents')`.

The lock is acquired when a user opens the sheet for editing and released on close or
after a timeout (same mechanism as `LPOSheetView.tsx`).

---

## Part 8 — Implementation Order

Work in this sequence to avoid breaking existing functionality:

1. **Backend models** — `TangaLPODocument.ts`, `DarLPODocument.ts` (no impact on
   existing models)
2. **Backend types** — add interfaces to `types/index.ts`
3. **Backend controllers** — `tangaLPOController.ts`, `darLPOController.ts`
4. **Backend routes** — `tangaLPORoutes.ts`, `darLPORoutes.ts`; register in
   `routes/index.ts`
5. **Frontend API functions** — add to `services/api.ts`
6. **Frontend types** — add to frontend types file
7. **Frontend hooks** — `useTangaLPOs.ts`, `useDarLPOs.ts`
8. **Frontend components** — Workbook → SheetView → EntryForm → Form → Summary
   (build Tanga first, then copy-adapt for Dar)
9. **Frontend pages** — `TangaLPOs.tsx`, `DarLPOs.tsx`
10. **Routing & navigation** — add routes in App.tsx; add sidebar links
11. **WebSocket events** — add new event names; subscribe in workbook components

---

## Part 9 — Files to Create (New)

```
backend/src/models/
  TangaLPODocument.ts
  DarLPODocument.ts

backend/src/controllers/
  tangaLPOController.ts
  darLPOController.ts

backend/src/routes/
  tangaLPORoutes.ts
  darLPORoutes.ts

frontend/src/hooks/
  useTangaLPOs.ts
  useDarLPOs.ts

frontend/src/components/
  TangaLPOWorkbook.tsx
  TangaLPOSheetView.tsx
  TangaLPOEntryForm.tsx
  TangaLPOForm.tsx
  TangaLPOSummary.tsx
  DarLPOWorkbook.tsx
  DarLPOSheetView.tsx
  DarLPOEntryForm.tsx
  DarLPOForm.tsx
  DarLPOSummary.tsx

frontend/src/pages/
  TangaLPOs.tsx
  DarLPOs.tsx
```

---

## Part 10 — Files to Modify (Existing, Minimal Touch)

| File | What changes |
|------|-------------|
| `backend/src/types/index.ts` | Add `ITangaLPOEntry`, `ITangaLPODocument`, `IDarLPOEntry`, `IDarLPODocument` interfaces |
| `backend/src/models/index.ts` | Export `TangaLPODocument`, `DarLPODocument` |
| `backend/src/controllers/index.ts` | Export `tangaLPOController`, `darLPOController` |
| `backend/src/routes/index.ts` | Register `/tanga-lpo` and `/dar-lpo` routes |
| `frontend/src/services/api.ts` | Add `tangaLPOAPI`, `darLPOAPI` objects |
| `frontend/src/App.tsx` | Add `/tanga-lpo` and `/dar-lpo` routes |
| `frontend/src/components/Sidebar.tsx` (or nav config) | Add nav links for Tanga LPO and Dar LPO |
| `frontend/src/types/index.ts` | Add `TangaLPO`, `TangaLPOEntry`, `DarLPO`, `DarLPOEntry` types |

No changes to `LPOSummary.ts`, `FuelRecord.ts`, `LPOWorkbook.ts`, or any existing
LPO/FuelRecord controllers. The only existing file that gets functional new code is
the backend types file and the route index — everything else is additive.

---

## Notes & Decisions

- **Separate collections over a discriminator**: Using two collections (`tangalpodocuments`,
  `darlpodocuments`) instead of one with a `yard` field keeps queries simpler, prevents
  accidental cross-yard reads, and allows independent growth of each yard's features.
- **No changes to existing YardFuelDispense flow**: The existing dispense-log linking
  for `mmsaYard` (Mombasa) stays untouched. Tanga and Dar shift to the formal LPO path.
  Their existing `YardFuelDispense` entries can continue to exist in parallel until you
  decide to retire that flow for those two yards.
- **LPO number format**: `TY-YYYY-NNN` for Tanga, `DY-YYYY-NNN` for Dar. The prefix
  makes it immediately obvious which yard an LPO belongs to in cross-system reports.
- **Unlinked entries are non-blocking**: If a `doNo` can't be matched to a FuelRecord
  at creation time, the LPO is still saved. A dashboard card surfaces unlinked entries
  for follow-up, same pattern as the existing pending YardFuelDispense workflow.

---

## Part 11 — Incremental Implementation Phases

Each phase is independently committable and testable. Nothing in a later phase breaks
what was built in an earlier one. Tanga is built first end-to-end, then Dar is a
direct copy-adapt — this means you can ship Tanga to yard staff before Dar is even
started.

---

### Phase 1 — Backend Models & Types (Foundation)

**Goal:** Add the new data shapes to the codebase without wiring anything up. Zero risk
of breaking existing behaviour.

**Files to create:**
- `backend/src/models/TangaLPODocument.ts` — full schema (see Part 1.1)
- `backend/src/models/DarLPODocument.ts` — full schema (see Part 1.1)

**Files to modify:**
- `backend/src/models/index.ts` — add exports for both models
- `backend/src/types/index.ts` — add `ITangaLPOEntry`, `ITangaLPODocument`,
  `IDarLPOEntry`, `IDarLPODocument`

**How to verify phase is done:**
- Backend compiles with `tsc --noEmit` with zero new errors
- Run `node -e "require('./dist/models').TangaLPODocument"` — no crash
- MongoDB shows `tangalpodocuments` and `darlpodocuments` collections created on
  first insert (you can test with a quick one-liner in Mongo shell)

**Dependencies:** None. Safe to merge at any time.

---

### Phase 2 — Tanga Backend: Controller + Routes

**Goal:** Tanga LPO API is fully functional and testable via Postman/curl. No frontend
yet.

**Files to create:**
- `backend/src/controllers/tangaLPOController.ts`
  - Implement all methods from Part 1.2:
    `createTangaLPO`, `getAllTangaLPOs`, `getTangaLPOById`, `getTangaLPOByLPONo`,
    `updateTangaLPO`, `cancelEntryInTangaLPO`, `cancelAllEntriesInTangaLPO`,
    `amendEntryInTangaLPO`, `getNextTangaLPONumber`, `getTangaWorkbookByYear`,
    `getTangaAvailableYears`
  - Include the FuelRecord write logic from Part 3 inside `createTangaLPO`,
    `updateTangaLPO`, `cancelEntryInTangaLPO`, `amendEntryInTangaLPO`,
    `cancelAllEntriesInTangaLPO`
- `backend/src/routes/tangaLPORoutes.ts` — full route table from Part 1.3

**Files to modify:**
- `backend/src/controllers/index.ts` — export `tangaLPOController`
- `backend/src/routes/index.ts` — register `/tanga-lpo` route

**How to verify phase is done:**
- `POST /api/v1/tanga-lpo` with a valid payload — returns 201, document in DB
- Check that the matched FuelRecord's `tangaYard` field updated and `balance`
  recalculated correctly
- `GET /api/v1/tanga-lpo` — returns paginated list
- `GET /api/v1/tanga-lpo/next-number` — returns `TY-2026-001` on empty collection
- `GET /api/v1/tanga-lpo/workbooks/2026` — returns grouped-by-month structure
- `POST /api/v1/tanga-lpo/cancel-entry` — entry marked cancelled, `tangaYard`
  decremented on the linked FuelRecord

**Dependencies:** Phase 1 must be done.

---

### Phase 3 — Dar Backend: Controller + Routes

**Goal:** Dar LPO API is live. Identical effort to Phase 2 but for Dar.

**Files to create:**
- `backend/src/controllers/darLPOController.ts` — copy `tangaLPOController.ts`,
  replace `TangaLPODocument` → `DarLPODocument`, `tangaYard` → `darYard`, `TY-` → `DY-`,
  all method names `tanga` → `dar`
- `backend/src/routes/darLPORoutes.ts` — same as `tangaLPORoutes.ts` but paths
  `/dar-lpo`, roles include `dar_yard`

**Files to modify:**
- `backend/src/controllers/index.ts` — export `darLPOController`
- `backend/src/routes/index.ts` — register `/dar-lpo` route

**How to verify phase is done:**
- Same Postman tests as Phase 2 but against `/api/v1/dar-lpo`
- Confirm `darYard` field updates on FuelRecord (not `tangaYard`)
- LPO numbers format `DY-2026-001`

**Dependencies:** Phase 1. (Phase 2 and 3 can be done in parallel if two people are
working, but Phase 2 first if solo since Tanga is the priority.)

---

### Phase 4 — Frontend Plumbing: Types + API + Hooks

**Goal:** Frontend has all the data-layer pieces ready. No visible UI yet — this is
pure wiring.

**Files to create:**
- `frontend/src/hooks/useTangaLPOs.ts` — React Query hooks (see Part 2.2)
- `frontend/src/hooks/useDarLPOs.ts` — same for Dar

**Files to modify:**
- `frontend/src/types/index.ts` — add `TangaLPO`, `TangaLPOEntry`, `DarLPO`,
  `DarLPOEntry` (see Part 2.3)
- `frontend/src/services/api.ts` — add `tangaLPOAPI` and `darLPOAPI` objects
  (see Part 2.1)

**How to verify phase is done:**
- Frontend compiles with `tsc --noEmit` with zero new type errors
- Open browser console on any existing page; run:
  ```js
  import('/src/services/api').then(m => console.log(m.tangaLPOAPI))
  ```
  Should print the API object (or just check no TS errors in the files)

**Dependencies:** Phases 2 and 3 must be done (the hooks call the API endpoints).

---

### Phase 5 — Tanga LPO: Create Form + List View (MVP)

**Goal:** Tanga yard staff can create a new LPO and see a list of existing ones. This
is the minimum usable version — no workbook/sheet view yet, but real data flows
through.

**Files to create:**
- `frontend/src/components/TangaLPOEntryForm.tsx` — modal for a single entry row
  (DO No, Truck No, Liters, Rate, Dest)
- `frontend/src/components/TangaLPOForm.tsx` — full LPO creation form (date,
  currency, notes, multi-row entries section using `TangaLPOEntryForm`)
- `frontend/src/pages/TangaLPOs.tsx` — page scaffold with:
  - Stats cards at top (LPOs this month, total liters, total amount, trucks served)
  - "New LPO" button → opens `TangaLPOForm`
  - Flat table list of all Tanga LPOs (date, lpoNo, # trucks, total liters, total
    amount, currency)
  - Basic date/search filter
  - Pagination

**Files to modify:**
- `frontend/src/App.tsx` — add route `/tanga-lpo` → `<TangaLPOs />`
- Sidebar/nav file — add "Tanga LPO" link (hidden for `dar_yard`, visible for
  `tanga_yard` + admin roles)

**How to verify phase is done:**
- Navigate to `/tanga-lpo` — page loads, stats show (zeros if no data)
- Click "New LPO" — form opens, add 2–3 trucks, submit
- LPO appears in the list
- Open the matching FuelRecord — confirm `tangaYard` column has updated and balance
  has changed
- Tanga yard user logs in — sees "Tanga LPO" in sidebar, can create LPO

**Dependencies:** Phase 4.

---

### Phase 6 — Tanga LPO: Workbook + Sheet View

**Goal:** Full spreadsheet experience for Tanga — browse by year/month, open
individual LPO sheets, edit entries, cancel, amend.

**Files to create:**
- `frontend/src/components/TangaLPOWorkbook.tsx` — year selector + month tabs +
  LPO tab list per month (see Part 2.5)
- `frontend/src/components/TangaLPOSheetView.tsx` — per-LPO editor with entry
  table, add/edit/cancel/amend row actions, total footer, edit lock, copy to
  clipboard, export PDF

**Files to modify:**
- `frontend/src/pages/TangaLPOs.tsx` — add `viewMode` state toggle (List /
  Workbook); render `TangaLPOWorkbook` when in workbook mode

**How to verify phase is done:**
- Switch to Workbook view on `/tanga-lpo` — year tabs appear, month tabs appear
- Click an LPO tab — `TangaLPOSheetView` opens with the entry table
- Add a new entry from inside the sheet — entry saved, FuelRecord updates
- Cancel an entry — `tangaYard` decremented on the linked FuelRecord
- Amend an entry — `originalLiters` saved, delta applied to FuelRecord
- Edit lock: open the same LPO in two tabs — second tab shows "locked by X"

**Dependencies:** Phase 5.

---

### Phase 7 — Tanga LPO: Summary View

**Goal:** Monthly aggregation view so managers can review Tanga yard output per month.

**Files to create:**
- `frontend/src/components/TangaLPOSummary.tsx` — monthly breakdown table
  (Month, # LPOs, Trucks, Total Liters, Total Amount)

**Files to modify:**
- `frontend/src/pages/TangaLPOs.tsx` — add Summary as third view mode; render
  `TangaLPOSummary`

**How to verify phase is done:**
- Switch to Summary view — monthly table appears with correct aggregated numbers
- Create a new LPO for the current month — summary updates after refresh

**Dependencies:** Phase 5.

---

### Phase 8 — Dar LPO: Full Frontend (mirror of Phases 5–7)

**Goal:** Dar yard has the same complete UI as Tanga.

**Files to create:**
- `frontend/src/components/DarLPOEntryForm.tsx`
- `frontend/src/components/DarLPOForm.tsx`
- `frontend/src/components/DarLPOWorkbook.tsx`
- `frontend/src/components/DarLPOSheetView.tsx`
- `frontend/src/components/DarLPOSummary.tsx`
- `frontend/src/pages/DarLPOs.tsx`

**Method:** Copy each Tanga component, do a find-replace:
- `Tanga` → `Dar`
- `tanga` → `dar`
- `tangaYard` → `darYard`
- `TY-` → `DY-`
- `tanga-lpo` → `dar-lpo`
- `tanga_yard` → `dar_yard`
- localStorage prefix `tanga-lpo:` → `dar-lpo:`

**Files to modify:**
- `frontend/src/App.tsx` — add route `/dar-lpo` → `<DarLPOs />`
- Sidebar/nav file — add "Dar LPO" link (visible to `dar_yard` + admin roles)

**How to verify phase is done:**
- Same tests as Phases 5–7 but against `/dar-lpo`
- Confirm `darYard` updates on FuelRecord (not `tangaYard`)
- Dar yard user sees only "Dar LPO" in sidebar; Tanga yard user sees only "Tanga LPO"

**Dependencies:** Phase 4 (backend is ready from Phase 3).

---

### Phase 9 — Unlinked Entries: Dashboard Card + Filter

**Goal:** Supervisors can see and act on LPO entries that failed to link to a
FuelRecord at creation time.

**Backend change:**
- Add query to `getAllTangaLPOs` (and Dar equivalent): when `filter=unlinked`, return
  only LPO entries where `linkedFuelRecordId` is null/empty and `isCancelled` is false.
- Add a count-only endpoint or include `unlinkedCount` in the existing list response
  metadata.

**Frontend change:**
- The stats card "Unlinked Entries" on both pages already renders (from Phase 5/8);
  wire it to the real count from the API.
- Clicking the card sets a `filter=unlinked` state that narrows the list view to only
  those entries.
- Add a "Link manually" action on each unlinked entry row — opens a small modal with
  a DO number input; on confirm, calls the backend to patch `linkedFuelRecordId` and
  update `tangaYard`/`darYard` on that FuelRecord.

**How to verify phase is done:**
- Create a Tanga LPO entry with a `doNo` that has no matching FuelRecord
- Dashboard card shows "1 Unlinked"
- Click card — list filters to that entry
- Click "Link manually", enter the correct DO — FuelRecord updates, entry moves out of
  the unlinked filter

**Dependencies:** Phases 6 and 8.

---

### Phase 10 — WebSocket Real-Time Sync

**Goal:** When another user creates or updates a Tanga/Dar LPO, all open workbook
tabs refresh automatically without a manual page reload.

**Backend change (`backend/src/controllers/tangaLPOController.ts`):**
- After `createTangaLPO` resolves: emit `tangaLPO:created` with
  `{ lpoId, lpoNo, year, month }`
- After `updateTangaLPO` resolves: emit `tangaLPO:updated` with `{ lpoId, lpoNo }`
- Same pattern in `darLPOController.ts`: emit `darLPO:created`, `darLPO:updated`
- Register the new event names in the WebSocket server's allowed-events list (if one
  exists)

**Frontend change:**
- In `TangaLPOWorkbook.tsx` and `TangaLPOSheetView.tsx`: subscribe to
  `tangaLPO:created` and `tangaLPO:updated` events via the existing `useRealtimeSync`
  hook (same pattern as `LPOWorkbook.tsx`); invalidate the relevant React Query cache
  keys on event
- Same in `DarLPOWorkbook.tsx` and `DarLPOSheetView.tsx` for `darLPO:*` events

**How to verify phase is done:**
- Open `/tanga-lpo` workbook in Tab A (Browser 1)
- Create a new Tanga LPO from Tab B (Browser 2 or incognito)
- Tab A updates without refresh — new LPO tab appears in the workbook

**Dependencies:** Phases 6 and 8.

---

### Phase 11 — Polish & Export

**Goal:** PDF export, copy-to-clipboard (text + WhatsApp format), print view — same
quality as the main LPO system.

**Files to create:**
- `frontend/src/utils/tangaLPOTextGenerator.ts` — plain-text and WhatsApp-format
  copy functions for a Tanga LPO (mirrors `lpoTextGenerator.ts`)
- `frontend/src/components/TangaLPOPrint.tsx` — print-friendly layout
  (mirrors `LPOPrint.tsx`)

**Files to modify:**
- `TangaLPOSheetView.tsx` — wire up "Copy text", "Copy WhatsApp", "Export PDF",
  "Print" buttons using the above utilities
- Same for `DarLPOSheetView.tsx` with Dar equivalents

**How to verify phase is done:**
- Open a Tanga LPO sheet, click "Copy WhatsApp" — formatted text is in clipboard
- Click "Export PDF" — browser downloads a PDF of the LPO
- Click Print — print-friendly layout renders correctly

**Dependencies:** Phase 6 and 8.

---

### Phase Summary Table

| Phase | What gets built | Who can use it after | Est. scope |
|-------|-----------------|----------------------|-----------|
| 1 | Backend models + types | No one yet (foundation) | Small |
| 2 | Tanga backend API | Postman / curl testing | Medium |
| 3 | Dar backend API | Postman / curl testing | Small (copy of Ph2) |
| 4 | Frontend data layer (types + hooks + API) | No one yet | Small |
| 5 | Tanga create form + list view | Tanga yard staff (MVP) | Medium |
| 6 | Tanga workbook + sheet view | Tanga yard staff (full) | Large |
| 7 | Tanga summary view | Managers | Small |
| 8 | Dar full frontend | Dar yard staff (full) | Medium (copy of 5–7) |
| 9 | Unlinked entries dashboard + manual link | Supervisors | Medium |
| 10 | WebSocket real-time sync | Everyone | Small |
| 11 | PDF / copy / print polish | Everyone | Small |

**Recommended stopping point after Phase 5:** You can hand the create+list view to
Tanga yard staff immediately and gather feedback before building the workbook. The
FuelRecord integration is already live from Phase 5 onward — real operational value
starts there.
