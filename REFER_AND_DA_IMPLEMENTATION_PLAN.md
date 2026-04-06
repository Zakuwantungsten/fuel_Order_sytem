# Refer & Driver Account Unified LPO Implementation Plan

## Problem Statement

The system currently handles two LPO types:

1. **Regular LPOs** — Created via `LPODetailForm`. Each row has a DO number that triggers a truck journey fetch (fuel record lookup). Liters auto-fill via station formulas. On submit, the fuel record is updated (checkpoint deduction). Stored in `LPOSummary` + synced to `LPOEntry`.

2. **Driver Account LPOs** — Created from the separate **Driver's Account tab** (`DriverAccountWorkbook`). DO is always `NIL`. No fuel record is touched. Stored in both `DriverAccountEntry` and a companion `LPOSummary` (`orderOf: 'DRIVER ACCOUNT'`).

### What Needs to Be Added

#### 1. Refer Trucks Feature
Partner/third-party company trucks occasionally get fuelled at our checkpoints or via cash. There is currently no way to track these in the system. A new **Refer** tab must be created on the LPO management page, and Refer entries must be creatable directly from the main LPO form.

#### 2. Unified LPO Form Entry Types
The regular `LPODetailForm` (used to create LPOs) must be extended so that **a single LPO document can contain rows of any type** — regular, Driver Account (DA), or Refer (REF) — all decided by what the user types in the DO number input field. The LPO management main list tab shows all trucks under every LPO. The Driver Acc tab and Refer tab each filter to their respective type only.

#### 3. DO Column Display Update
In the DO column — both in the form, in the list, and in downloaded documents — the display must reflect the entry type:
- Regular: actual DO number (e.g. `T1234/IMP`)
- DA row: `DA(NIL)` with the real journey DO stored as a reference
- REF row: `REF`

---

## Answers to Key Design Questions

| Question | Answer |
|---|---|
| Can one LPO mix entry types? | **Yes.** One LPO can have regular rows, DA rows, and REF rows. |
| What does the main List tab show? | All trucks under every LPO regardless of type. |
| What does the Driver Acc tab show? | Only LPO entries where `isDriverAccount: true`. |
| What does the new Refer tab show? | Only LPO entries where `isRefer: true`. |
| Downloads from any tab? | Fetch the full `LPOSummary` by `lpoNo` — all rows included in the document. |
| DA from main form — what happens to DO? | Display: `DA(NIL)`. Still fetches truck + journey. Direction toggle works. Reference DO stored separately. |
| REF entries — does it fetch truck data? | **No.** No journey lookup. No direction toggle. Status column shows `REF` badge. |
| REF entries — partner company details? | Same fields as a regular entry for now (truck number + liters + station). |
| Storage approach for REF? | Flag `isRefer: true` on `LPOSummary.lpoDetailSchema` and `LPOEntry`. No new collection needed. |

---

## Architecture Decision: Why No New Collection for REF

- `DriverAccountEntry` exists as a separate collection because it has a settlement lifecycle (pending → settled → disputed) per driver — a per-row financial workflow.
- REF trucks have no such settlement workflow. They are simply third-party trucks whose fuel is noted.
- Adding `isRefer: true` to the existing `LPOEntry`/`LPOSummary` entry schema keeps the data model consistent with the already-working `isDriverAccount` pattern.
- The Refer tab runs a filter `{ isRefer: true }` on the same `LPOEntry` collection — no new API surface or mongoose model required.

---

## Implementation Phases (in execution order)

---

### PHASE 1 — Backend Schema Changes
**Do this first.** Everything downstream depends on the data shape.

#### 1a. `backend/src/models/LPOSummary.ts` — `lpoDetailSchema`
Add two new fields to the per-row sub-document:

```ts
isRefer: {
  type: Boolean,
  default: false,
},
referenceDoNo: {        // Stores actual journey DO for DA rows (display: DA(NIL)-<referenceDoNo>)
  type: String,
  trim: true,
  default: null,
},
```

#### 1b. `backend/src/models/LPOEntry.ts`
Add `isRefer` field and extend `paymentMode` enum:

```ts
isRefer: {
  type: Boolean,
  default: false,
},
// paymentMode enum: add 'REFER'
paymentMode: {
  type: String,
  enum: ['STATION', 'CASH', 'DRIVER_ACCOUNT', 'REFER'],
  default: 'STATION',
},
```

Add index:
```ts
lpoEntrySchema.index({ isRefer: 1 });
```

**Files to edit:**
- `backend/src/models/LPOSummary.ts`
- `backend/src/models/LPOEntry.ts`

---

### PHASE 2 — Backend Controller Changes
**Do this second.** Depends on Phase 1 schema.

#### 2a. `lpoSummaryController.ts` — `updateFuelRecordForLPOEntry()`
Add early-exit for REF entries (alongside the existing NIL early-exit):

```ts
const isRefEntry = doNoUpper === 'REF';
if (isNilDO || isRefEntry) {
  logger.info(`Skipping fuel record update for ${isRefEntry ? 'REF' : 'NIL'} DO (truck: ${truckNo})`);
  return;
}
```

#### 2b. `lpoSummaryController.ts` — `syncLPOEntriesToList()`
Pass `isRefer` and `referenceDoNo` through to the created `LPOEntry` record:

```ts
// Determine payment mode
let paymentMode: 'STATION' | 'CASH' | 'DRIVER_ACCOUNT' | 'REFER' = 'STATION';
if (entry.isRefer) {
  paymentMode = 'REFER';
} else if (entry.isDriverAccount) {
  paymentMode = 'DRIVER_ACCOUNT';
} else if (lpoSummary.station?.toUpperCase() === 'CASH' || entry.cancellationPoint) {
  paymentMode = 'CASH';
}

await LPOEntry.create({
  // ... existing fields ...
  isDriverAccount: entry.isDriverAccount || false,
  isRefer: entry.isRefer || false,
  referenceDo: entry.referenceDoNo || entry.referenceDo || null,
  paymentMode,
  doSdo: entry.isRefer
    ? 'REF'
    : entry.isDriverAccount
      ? `DA(NIL)`
      : (entry.isCancelled ? 'CANCELLED' : (entry.doNo || 'PENDING')),
  // ...
});
```

#### 2c. `lpoSummaryController.ts` — `createLPOSummary()`
For DA entries coming from the main form (`entry.isDriverAccount === true`), also create a `DriverAccountEntry` side-record so it appears in the Driver Acc workbook's settlement tracking:

```ts
for (const entry of entries) {
  if (entry.isDriverAccount) {
    await DriverAccountEntry.create({
      date,
      month,
      year,
      lpoNo: summaryLpoNo,
      truckNo: entry.truckNo,
      liters: entry.liters,
      rate: entry.rate,
      amount: entry.liters * entry.rate,
      station,
      journeyDirection: entry.journeyDirection || 'going',
      originalDoNo: entry.referenceDoNo || null,
      status: 'pending',
      createdBy: req.user?.username || 'system',
      lpoCreated: true,
      lpoSummaryId: createdSummary._id.toString(),
    });
  }
}
```

#### 2d. `lpoEntryController.ts` — `getAllLPOEntries()`
Add `isRefer` query filter support:

```ts
const { ..., isRefer, isDriverAccount } = req.query;

if (isRefer === 'true') {
  filter.isRefer = true;
}
if (isDriverAccount === 'true') {
  filter.isDriverAccount = true;
}
```

**Files to edit:**
- `backend/src/controllers/lpoSummaryController.ts`
- `backend/src/controllers/lpoEntryController.ts`

---

### PHASE 3 — Frontend: `LPODetailForm.tsx`
**Third.** This is the largest change and must land with Phase 1 & 2 done.

#### 3a. Entry Type Detection (per row, on DO input change)
In `handleDONoChange()`, before the existing fetch logic:

```ts
const DA_TRIGGER = 'DA';
const REF_TRIGGER = 'REF';

const entryType: 'regular' | 'da' | 'ref' =
  doNoUpper === DA_TRIGGER  ? 'da'  :
  doNoUpper === REF_TRIGGER ? 'ref' :
  'regular';
```

Store `entryType` in `EntryAutoFillData`:
```ts
interface EntryAutoFillData {
  // ... existing fields ...
  entryType?: 'regular' | 'da' | 'ref';
  referenceDoNo?: string;  // for DA: the real journey DO
}
```

#### 3b. DA Mode Behavior
When `doNoUpper === 'DA'`:
- Show a blue `DA` badge on the row
- Trigger `fetchTruckData(truckNo)` normally (same as regular)
- Populate going DO, returning DO, destination, liters, direction toggle — all work identically
- Store real journey DO in `entryAutoFillData[index].referenceDoNo`
- Entry serialized as:
  ```ts
  { doNo: 'NIL', isDriverAccount: true, referenceDoNo: <journey DO>, ... }
  ```
- Display in form DO field: `DA(NIL)` with a small sub-label showing the reference DO

#### 3c. REF Mode Behavior
When `doNoUpper === 'REF'`:
- Show an orange `REF` badge on the row
- **No truck fetch.** No journey lookup.
- Direction toggle hidden for this row.
- Status column shows `REF` badge (orange).
- Entry serialized as:
  ```ts
  { doNo: 'REF', isRefer: true, ... }
  ```

#### 3d. Submit Serialization
In the `validEntries` mapper inside `handleSubmit()`:
```ts
validEntries = formData.entries.map((entry, idx) => {
  const af = entryAutoFillData[idx];
  return {
    ...entry,
    doNo: af?.entryType === 'da'  ? 'NIL'
        : af?.entryType === 'ref' ? 'REF'
        : (entry.doNo?.trim() || 'NIL'),
    isDriverAccount: af?.entryType === 'da',
    isRefer:         af?.entryType === 'ref',
    referenceDoNo:   af?.entryType === 'da' ? af.referenceDoNo : undefined,
    journeyDirection: af?.direction,
  };
});
```

#### 3e. Visual Changes in Form Table
| Entry Type | DO column display | Status column |
|---|---|---|
| Regular | Actual DO number | Going / Returning badge |
| DA | `DA(NIL)` + ref DO sub-label | Blue `DA` badge |
| REF | `REF` | Orange `REF` badge |

**Files to edit:**
- `frontend/src/components/LPODetailForm.tsx`

---

### PHASE 4 — Frontend: `useLPOs.ts` — Add `useReferEntries` Hook
**Fourth.** Depends on Phase 2d (backend filter).

Add alongside the existing `useDriverAccountEntries`:

```ts
export function useReferEntries() {
  return useQuery({
    queryKey: [...lpoKeys.all, 'referEntries'] as const,
    queryFn: async () => {
      const response = await lposAPI.getAll({ isRefer: true, limit: 10000 });
      const entries = Array.isArray(response.data) ? response.data : [];
      return entries.map((entry: any, idx: number) => ({
        id: `ref-${entry.id || entry._id || idx}`,
        sn: idx + 1,
        date: entry.date,
        lpoNo: entry.lpoNo,
        dieselAt: entry.dieselAt,
        doSdo: 'REF',
        truckNo: entry.truckNo,
        ltrs: entry.ltrs,
        pricePerLtr: entry.pricePerLtr,
        destinations: entry.destinations || 'REFER',
        createdAt: entry.createdAt,
        isCancelled: entry.isCancelled || false,
        isRefer: true,
      } as LPOEntry));
    },
    staleTime: 5 * 60 * 1000,
  });
}
```

Also extend `lpoKeys`:
```ts
export const lpoKeys = {
  // ... existing keys ...
  referEntries: () => [...lpoKeys.all, 'referEntries'] as const,
};
```

**Files to edit:**
- `frontend/src/hooks/useLPOs.ts`

---

### PHASE 5 — Frontend: New `ReferWorkbook.tsx` Component
**Fifth.** Mirrors `DriverAccountWorkbook.tsx` in structure.

Key differences from Driver Acc workbook:
- Data source: `useReferEntries()` (not `driverAccountAPI`)
- No settlement status column (pending/settled/disputed) — REF entries have no financial settlement workflow yet
- Column headers: Date, LPO No., Station, Truck No., Ltrs, Rate, Amount
- Download action: fetches full `LPOSummary` by `lpoNo` via `lpoDocumentsAPI.getByLpoNo()` — renders the entire LPO including all row types

**Files to create:**
- `frontend/src/components/ReferWorkbook.tsx`

---

### PHASE 6 — Frontend: `LPOs.tsx` — Add Refer Tab
**Sixth.** Depends on Phases 4 & 5.

#### 6a. Extend VIEW_MODES
```ts
const VIEW_MODES = ['list', 'workbook', 'summary', 'driver_account', 'refer'] as const;
```

#### 6b. Import and wire `useReferEntries`
```ts
import { ..., useReferEntries } from '../hooks/useLPOs';
const { data: referEntries = [] } = useReferEntries();
```

#### 6c. Add Refer button to view mode toggle strip
```tsx
<button
  onClick={() => setViewMode('refer')}
  className={`px-3 py-2 text-sm font-medium rounded-r-md border ... ${
    viewMode === 'refer' ? 'bg-orange-600 text-white border-orange-600' : '...'
  }`}
>
  <Truck className="w-4 h-4 mr-1 inline" />
  Refer
</button>
```

#### 6d. Add Refer tab render
```tsx
if (viewMode === 'refer') {
  return (
    <div>
      {/* header + view mode toggle */}
      <ReferWorkbook onNavigateToSheet={handleNavigateToSheet} />
    </div>
  );
}
```

#### 6e. Main list tab DO column
The `doSdo` field now comes from the database already set correctly (`DA(NIL)`, `REF`, or actual DO). No special rendering logic needed. Optionally add color-coded badge rendering in the list row for visual distinction.

**Files to edit:**
- `frontend/src/pages/LPOs.tsx`

---

### PHASE 7 — Frontend: Download / PDF / Image Utils
**Seventh.** Depends on all prior phases.

#### 7a. `lpoImageGenerator.ts` and `lpoTextGenerator.ts`
In the DO column rendering of the downloaded LPO document, check `entry.isDriverAccount` and `entry.isRefer`:

```ts
function formatEntryDoColumn(entry: LPODetail): string {
  if (entry.isRefer) return 'REF';
  if (entry.isDriverAccount) {
    const refDo = (entry as any).referenceDoNo;
    return refDo ? `DA(NIL)-${refDo}` : 'DA(NIL)';
  }
  return entry.doNo || 'NIL';
}
```

#### 7b. Download from any tab
All download handlers (from Refer tab, Driver Acc tab, and main list) must call `lpoDocumentsAPI.getByLpoNo(lpo.lpoNo)` to get the **full** `LPOSummary` — so all rows of the LPO (regular + DA + REF) appear in the generated PDF/image, not just the filtered view.

This is already the pattern used in the main list tab — just ensure `ReferWorkbook` and the Refer tab's download buttons do the same.

**Files to edit:**
- `frontend/src/utils/lpoImageGenerator.ts`
- `frontend/src/utils/lpoTextGenerator.ts`

---

## File Change Summary

| Priority | Layer | File | Change Type |
|---|---|---|---|
| 1 | Backend Model | `backend/src/models/LPOSummary.ts` | Add `isRefer`, `referenceDoNo` to lpoDetailSchema |
| 1 | Backend Model | `backend/src/models/LPOEntry.ts` | Add `isRefer` field, `REFER` paymentMode, index |
| 2 | Backend Controller | `backend/src/controllers/lpoSummaryController.ts` | Skip REF in fuel update; pass `isRefer` in sync; create DA side-record |
| 2 | Backend Controller | `backend/src/controllers/lpoEntryController.ts` | Add `isRefer` + `isDriverAccount` query filters |
| 3 | Frontend Component | `frontend/src/components/LPODetailForm.tsx` | DA/REF detection, badges, auto-fill, serialize |
| 4 | Frontend Hook | `frontend/src/hooks/useLPOs.ts` | Add `useReferEntries()` hook + cache key |
| 5 | Frontend Component | `frontend/src/components/ReferWorkbook.tsx` | New component (mirrors DriverAccountWorkbook) |
| 6 | Frontend Page | `frontend/src/pages/LPOs.tsx` | Add `refer` view mode, toggle button, tab render |
| 7 | Frontend Utils | `frontend/src/utils/lpoImageGenerator.ts` | DA/REF DO column formatting |
| 7 | Frontend Utils | `frontend/src/utils/lpoTextGenerator.ts` | DA/REF DO column formatting |

---

## Execution Order

```
Phase 1 (Models)
    └── Phase 2 (Controllers)
            └── Phase 3 (LPODetailForm — biggest change)
            └── Phase 4 (useLPOs hook)
                    └── Phase 5 (ReferWorkbook component)
                            └── Phase 6 (LPOs.tsx page — wires everything)
                                    └── Phase 7 (PDF/Image utils)
```

Start with **Phase 1** — nothing else can be built or tested until the schema supports `isRefer` and `referenceDoNo`.
