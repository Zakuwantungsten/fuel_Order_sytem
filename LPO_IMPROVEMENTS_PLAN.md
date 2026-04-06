# LPO System Improvements — Implementation Plan

## Problems Being Solved

### Problem 1 — Truck Number Fetch Fires Too Early
**Current behaviour:** `handleTruckNoChange` is called on every keystroke. The moment the formatted truck number hits ≥ 5 characters, `fetchTruckData()` fires an API call. For a truck like `T889 DVZ` (8 chars), the fetch fires at `T889 D` (7 chars) — auto-filling wrong data — and the user, seeing auto-filled fields, stops typing, leaving the truck number saved as `T889 D` with incorrect or unintended fuel record data.

**Root cause:** No debounce at all on manual input. The `length >= 5` gate is a minimum guard only, not a completion detector.

**File:** `frontend/src/components/LPODetailForm.tsx`

---

### Problem 2 — Sheet View Shows Incomplete / Wrong LPO Data
**Current behaviour:** When a user clicks any row in the Driver's Account tab or Refer tab and is navigated to the workbook sheet view, the sheet may show only 1 truck (because old DA entries each created their own 1-truck `LPOSummary`). Even from the main LPO list, the sheet view receives data from the year-workbook cache loaded on navigation — not a fresh server fetch. The result: missing trucks, missing DA/REF rows in the same LPO.

**Root cause architectural flaw:**
- `LPOWorkbook.tsx` fetches the entire year's workbook (all LPOs), then finds the target sheet by `lpoNo` in the pre-loaded array
- `LPOSheetView.tsx` receives the sheet as a `prop` and seeds local state from it — no server fetch of its own
- The loaded cache may be stale or the sheet's `entries[]` may not include DA/REF entries added after initial creation

**Files:** `frontend/src/components/LPOWorkbook.tsx`, `frontend/src/components/LPOSheetView.tsx`

---

### Problem 3 — No "Cancel Whole LPO" Feature
**Current behaviour:** Cancellation is per-truck only. Each row has an individual cancel button. To cancel an LPO with 10 trucks, the user must click cancel 10 times.

**Required behaviour:** A "Cancel Entire LPO" button on the sheet view header that:
- Shows a confirmation modal listing all active (non-cancelled) trucks
- Cancels each truck applying correct logic per type:
  - **Regular trucks** → revert fuel record deduction at the correct cancellation checkpoint
  - **DA trucks** → mark cancelled, no fuel record change
  - **REF trucks** → mark cancelled, no fuel record change
- Shows a clear "what will happen" breakdown in the modal

**Files:** `frontend/src/components/LPOSheetView.tsx`, backend endpoint needed

---

### Problem 4 — No Search Bar in Sheet View
**Current behaviour:** `LPOSheetView.tsx` renders `editedSheet.entries` unfiltered with no search/filter UI. For large LPOs (20+ trucks) there is no way to find a specific truck quickly.

**Required behaviour:** A search input in the sheet view header area that filters displayed entries by truck number, DO number, or destination in real-time (client-side, no API call).

**File:** `frontend/src/components/LPOSheetView.tsx`

---

## Architecture Decision — Server-Side Sheet Data Fetch

### Why the current approach is wrong
The workbook pattern was designed for an era where each LPO had its own type. Now that one LPO can contain regular + DA + REF rows (added from different tabs at different times), the cached year-load cannot be a reliable data source. The UI must fetch fresh data from the server when opening a sheet.

### The corrected pattern

```
Year workbook load (LPOWorkbook.tsx)
  → Purpose: navigation index only (tab names, lpoNos, count)
  → Source: lpoWorkbookAPI.getByYear(year)  ← unchanged

Active sheet content (LPOSheetView.tsx)
  → Purpose: full entry data for display and editing
  → Source: lpoDocumentsAPI.getByLpoNo(lpoNo)  ← NEW on-mount fetch
  → Always fresh from server
  → Includes ALL entries regardless of entry type
```

The `LPOWorkbook` still loads the year for the tab strip (sheet names). But when `LPOSheetView` mounts or its `lpoNo` changes, it independently fetches that specific LPO document from `GET /lpo-documents/lpo/:lpoNo` — which already exists and returns the complete `LPOSummary` with all embedded entries.

---

## Implementation Phases

---

## Phase A — Truck Number Fetch: Format-Completion Detection

### Goal
Only fire `fetchTruckData()` when the truck number **matches the completed format** `T{digits} {2+ letters}` (e.g. `T889 DVZ`). Add a 300ms safety timer only as a final guard — not as the primary trigger. Never fire on partial input regardless of typing speed.

### Rationale
The previous approach (700ms time-based debounce) would misfire for slow typists:
- A user who pauses at `T889 D` for >700ms would trigger a useless fetch
- The format regex `^T\d+ [A-Z]{2,}$` is the structurally correct gate: it matches only when the alphanumeric suffix is at least 2 characters, which is the minimum for a valid Zambian truck suffix

### Truck format
```
T{one or more digits} {two or more uppercase letters}
Examples: T889 DVZ, T12 AB, T1200 ZMB
Regex: /^T\d+ [A-Z]{2,}$/
```

### File
`frontend/src/components/LPODetailForm.tsx`

### What to add/change

#### Step 1 — Add a debounce ref map at the top of the component
Near the existing refs (around line 310–320), add:

```ts
// Map of entry index → debounce timer ID (300ms safety timer)
const fetchDebounceTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
```

#### Step 2 — Replace the immediate fetch inside `handleTruckNoChange`

Replace the current `length >= 5` gate with format-completion detection:

```ts
const TRUCK_FORMAT_COMPLETE = /^T\d+ [A-Z]{2,}$/;

if (TRUCK_FORMAT_COMPLETE.test(formattedTruckNo)) {
  // Format is complete — clear any previous timer for this row
  if (fetchDebounceTimers.current[index]) {
    clearTimeout(fetchDebounceTimers.current[index]);
  }

  // Show loading indicator immediately
  setEntryAutoFillData(prev => ({
    ...prev,
    [index]: { ...prev[index], loading: true, fetched: false }
  }));

  // 300ms safety timer (guards the final character gap, not typing speed)
  fetchDebounceTimers.current[index] = setTimeout(async () => {
    const result = await fetchTruckData(formattedTruckNo);
    // ... existing result application logic (unchanged)
    delete fetchDebounceTimers.current[index];
  }, 300);
} else {
  // Format incomplete — clear any pending timer and reset state
  if (fetchDebounceTimers.current[index]) {
    clearTimeout(fetchDebounceTimers.current[index]);
    delete fetchDebounceTimers.current[index];
  }
  setEntryAutoFillData(prev => ({
    ...prev,
    [index]: { ...prev[index], loading: false, fetched: false }
  }));
}
```

#### Step 3 — Cleanup on component unmount

```ts
useEffect(() => {
  return () => {
    Object.values(fetchDebounceTimers.current).forEach(clearTimeout);
  };
}, []);
```

#### Step 4 — Clear timer when row is removed
When an entry row is deleted (the existing `removeEntry` function), also clear its pending timer:

```ts
// Inside removeEntry(index):
if (fetchDebounceTimers.current[index]) {
  clearTimeout(fetchDebounceTimers.current[index]);
  delete fetchDebounceTimers.current[index];
}
```

### What does NOT change
- The `handleTruckPaste` multiple-truck path with `setTimeout(fn, i * 250)` staggering stays as-is
- `fetchTruckData` itself is unchanged
- The DA/REF detection in `handleDONoChange` is unchanged

---

## Phase B — Server-Side Sheet Data Fetch

### Goal
`LPOSheetView` independently fetches its data from `GET /lpo-documents/lpo/:lpoNo` on mount, rather than relying on data passed as a prop from `LPOWorkbook`'s year-load cache.

### Files
- `frontend/src/components/LPOSheetView.tsx` — primary changes
- `frontend/src/components/LPOWorkbook.tsx` — minor prop addition

### Changes to `LPOSheetView.tsx`

#### Step 1 — Update props interface
Currently:
```ts
interface LPOSheetViewProps {
  sheet: LPOSheet;
  workbookId: string | number;
  onUpdate: (updatedSheet: LPOSheet) => void;
}
```

Change to:
```ts
interface LPOSheetViewProps {
  sheet: LPOSheet;           // still passed for initial render + tab metadata
  workbookId: string | number;
  onUpdate: (updatedSheet: LPOSheet) => void;
  lpoNo?: string;            // NEW: when provided, triggers a fresh server fetch
}
```

#### Step 2 — Add import for lpoDocumentsAPI
```ts
import { lpoWorkbookAPI, lpoDocumentsAPI } from '../services/api';
```

#### Step 3 — Add fetch state
```ts
const [isFetchingSheet, setIsFetchingSheet] = useState(false);
```

#### Step 4 — Add server-fetch useEffect
After the existing `useEffect(() => { setEditedSheet(sheet) }, [sheet])`, add:

```ts
useEffect(() => {
  if (!lpoNo) return;

  const fetchFreshSheet = async () => {
    setIsFetchingSheet(true);
    try {
      const freshLpo = await lpoDocumentsAPI.getByLpoNo(lpoNo);
      if (freshLpo) {
        setEditedSheet(freshLpo as LPOSheet);
        const hasCancelled = freshLpo.entries?.some(e => e.isCancelled);
        if (hasCancelled) {
          setCancellationReport(generateCancellationReport(freshLpo as LPOSheet));
        } else {
          setCancellationReport(null);
        }
      }
    } catch (err) {
      console.error('Failed to refresh sheet data:', err);
      // Fall back to prop data — no crash
    } finally {
      setIsFetchingSheet(false);
    }
  };

  fetchFreshSheet();
}, [lpoNo]);   // fires every time the active sheet changes
```

#### Step 5 — Show loading overlay
At the top level of the returned JSX, add a subtle loading indicator:

```tsx
{isFetchingSheet && (
  <div className="absolute inset-0 bg-white/60 dark:bg-gray-800/60 flex items-center justify-center z-10">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
  </div>
)}
```

#### Step 6 — Expose `refreshSheet` for post-cancel/post-save re-fetch
Add a helper function inside the component:

```ts
const refreshSheet = async () => {
  if (!lpoNo) return;
  try {
    const freshLpo = await lpoDocumentsAPI.getByLpoNo(lpoNo);
    if (freshLpo) setEditedSheet(freshLpo as LPOSheet);
  } catch {}
};
```

Call `refreshSheet()` after any successful save or cancel operation (instead of only updating local state), ensuring the view stays in sync with the server.

### Changes to `LPOWorkbook.tsx`

#### Step 1 — Pass `lpoNo` down to `LPOSheetView`
Currently (line 301–311):
```tsx
<LPOSheetView
  sheet={activeSheet}
  workbookId={workbook.id!}
  onUpdate={...}
/>
```

Add the `lpoNo` prop:
```tsx
<LPOSheetView
  sheet={activeSheet}
  workbookId={workbook.id!}
  lpoNo={activeSheet?.lpoNo}   // NEW
  onUpdate={...}
/>
```

### What does NOT change
- `lpoWorkbookAPI.getByYear()` is still called — the tab list (sheet names) still comes from the year-load
- `LPOWorkbook`'s tab switching (`setActiveSheetId`) is unchanged
- The `onUpdate` callback and local state update in `LPOWorkbook` still work for optimistic UI after edits
- Navigation from `onNavigateToSheet` in `LPOs.tsx` is unchanged

---

## Phase C — Cancel Entire LPO

### Goal
A "Cancel LPO" button in the `LPOSheetView` header. When clicked, shows a modal listing all non-cancelled trucks with a breakdown of what will happen (fuel reversal vs no-op). Confirming cancels all of them sequentially.

### Files
- `frontend/src/components/LPOSheetView.tsx`
- `backend/src/controllers/lpoSummaryController.ts` — new bulk-cancel endpoint
- `backend/src/routes/lpoSummaryRoutes.ts` — register new route

### Backend — New Endpoint

**Route:** `POST /lpo-documents/:id/cancel-all`

**Controller function: `cancelAllEntries`**

Logic:
```ts
export const cancelAllEntries = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { reason } = req.body;

  const lpo = await LPOSummary.findById(id);
  if (!lpo) return res.status(404).json({ success: false, message: 'LPO not found' });

  const activeEntries = lpo.entries.filter(e => !e.isCancelled);
  const results = [];

  for (const entry of activeEntries) {
    const isDA = entry.isDriverAccount;
    const isRef = entry.isRefer;
    const doNoUpper = (entry.doNo || '').toUpperCase().trim();
    const isNilOrSpecial = doNoUpper === 'NIL' || doNoUpper === 'REF' ||
                           doNoUpper === 'DA' || doNoUpper === '' || isDA || isRef;

    if (!isNilOrSpecial && entry.truckNo && entry.doNo) {
      // Regular entry — revert fuel record
      try {
        await updateFuelRecordForLPOEntry(
          entry.truckNo,
          entry.doNo,
          entry.liters,
          'cancel',   // direction = revert
          lpo.station
        );
        results.push({ truckNo: entry.truckNo, reverted: true });
      } catch (err) {
        results.push({ truckNo: entry.truckNo, reverted: false, error: String(err) });
      }
    } else {
      // DA or REF — just mark cancelled
      results.push({ truckNo: entry.truckNo, reverted: false, reason: 'DA/REF - no fuel record' });
    }

    entry.isCancelled = true;
    entry.cancellationReason = reason || 'Bulk LPO cancellation';
  }

  lpo.isCancelled = true;   // Mark whole LPO cancelled (if this field exists, else skip)
  await lpo.save();

  // Sync cancelled status to LPOEntry flat collection
  await LPOEntry.updateMany(
    { lpoNo: lpo.lpoNo },
    { $set: { isCancelled: true } }
  );

  return res.status(200).json({ success: true, data: { lpoNo: lpo.lpoNo, results } });
};
```

**Route registration** in `lpoSummaryRoutes.ts`:
```ts
router.post('/:id/cancel-all', authenticate, asyncHandler(lpoSummaryController.cancelAllEntries));
```

**API service** in `frontend/src/services/api.ts` — add to `lpoDocumentsAPI`:
```ts
cancelAll: async (id: string, reason?: string): Promise<{ lpoNo: string; results: any[] }> => {
  const response = await apiClient.post(`/lpo-documents/${id}/cancel-all`, { reason });
  return response.data.data;
},
```

### Frontend — New Modal and Button in `LPOSheetView.tsx`

#### Step 1 — Add state
```ts
const [showCancelAllModal, setShowCancelAllModal] = useState(false);
const [isCancellingAll, setIsCancellingAll] = useState(false);
```

#### Step 2 — Add "Cancel LPO" button in header
Next to the existing export/copy buttons in the LPOSheetView header:

```tsx
<button
  onClick={() => setShowCancelAllModal(true)}
  className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800"
>
  <XCircle className="w-4 h-4 mr-1.5" />
  Cancel LPO
</button>
```

Only show this button if there are any non-cancelled entries.

#### Step 3 — The confirmation modal

```tsx
{showCancelAllModal && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg mx-4">
      <div className="px-6 py-4 border-b dark:border-gray-700">
        <h2 className="text-lg font-semibold text-red-700 dark:text-red-400">
          Cancel Entire LPO — {editedSheet.lpoNo}
        </h2>
      </div>

      <div className="px-6 py-4 space-y-4">
        {/* Summary of what will happen */}
        {(() => {
          const active = editedSheet.entries.filter(e => !e.isCancelled);
          const regularEntries = active.filter(e => {
            const doUp = (e.doNo || '').toUpperCase();
            return !e.isDriverAccount && !e.isRefer && doUp !== 'NIL' && doUp !== 'REF';
          });
          const daOrRefEntries = active.filter(e => e.isDriverAccount || e.isRefer);

          return (
            <>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                This will cancel <strong>{active.length}</strong> active truck{active.length !== 1 ? 's' : ''} on this LPO.
              </p>
              {regularEntries.length > 0 && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm text-red-700 dark:text-red-300">
                  <p className="font-medium mb-1">
                    {regularEntries.length} regular truck{regularEntries.length !== 1 ? 's' : ''} — fuel records WILL be reverted:
                  </p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {regularEntries.map((e, i) => (
                      <li key={i}>{e.truckNo} ({e.liters}L)</li>
                    ))}
                  </ul>
                </div>
              )}
              {daOrRefEntries.length > 0 && (
                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-400">
                  <p className="font-medium mb-1">
                    {daOrRefEntries.length} DA/Refer truck{daOrRefEntries.length !== 1 ? 's' : ''} — marked cancelled only, no fuel change:
                  </p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {daOrRefEntries.map((e, i) => (
                      <li key={i}>{e.truckNo} ({e.isDriverAccount ? 'DA' : 'REF'})</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          );
        })()}
      </div>

      <div className="flex items-center justify-end gap-3 px-6 py-4 border-t dark:border-gray-700">
        <button
          onClick={() => setShowCancelAllModal(false)}
          className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
        >
          Go Back
        </button>
        <button
          onClick={handleCancelAll}
          disabled={isCancellingAll}
          className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md disabled:opacity-50"
        >
          {isCancellingAll ? 'Cancelling...' : 'Cancel Entire LPO'}
        </button>
      </div>
    </div>
  </div>
)}
```

#### Step 4 — `handleCancelAll` function

```ts
const handleCancelAll = async () => {
  setIsCancellingAll(true);
  try {
    await lpoDocumentsAPI.cancelAll(editedSheet.id as string, 'Bulk LPO cancellation');
    toast.success(`LPO ${editedSheet.lpoNo} cancelled successfully`);
    setShowCancelAllModal(false);
    // Refresh sheet from server to get updated state
    await refreshSheet();
  } catch (err: any) {
    toast.error(`Failed to cancel LPO: ${err?.message || 'Unknown error'}`);
  } finally {
    setIsCancellingAll(false);
  }
};
```

---

## Phase D — Search Bar in Sheet View

### Goal
A text input in the sheet view that filters the displayed entries by truck number, DO number, or destination. Client-side filter on `editedSheet.entries` — no API call.

### File
`frontend/src/components/LPOSheetView.tsx`

### Changes

#### Step 1 — Add search state
```ts
const [entrySearch, setEntrySearch] = useState('');
```

#### Step 2 — Compute filtered entries
Replace all uses of `editedSheet.entries.map(...)` with a derived filtered array:

```ts
const visibleEntries = entrySearch.trim()
  ? editedSheet.entries.filter(entry => {
      const term = entrySearch.toLowerCase();
      return (
        (entry.truckNo || '').toLowerCase().includes(term) ||
        (entry.doNo || '').toLowerCase().includes(term) ||
        (entry.dest || '').toLowerCase().includes(term)
      );
    })
  : editedSheet.entries;
```

Then replace `editedSheet.entries.map(...)` in both the mobile card view and desktop table view with `visibleEntries.map(...)`.

#### Step 3 — Add search input to header area
In the sheet view header (near the export/download buttons), add:

```tsx
<div className="relative">
  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
  <input
    type="text"
    value={entrySearch}
    onChange={(e) => setEntrySearch(e.target.value)}
    placeholder="Search truck, DO..."
    className="pl-9 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 w-48"
  />
</div>
```

#### Step 4 — Show "no results" state
Under the table, if `visibleEntries.length === 0` and `entrySearch` is non-empty:

```tsx
{visibleEntries.length === 0 && entrySearch && (
  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
    <p>No entries match "{entrySearch}"</p>
    <button onClick={() => setEntrySearch('')} className="text-sm text-blue-600 mt-2">
      Clear search
    </button>
  </div>
)}
```

#### Step 5 — Reset search when active sheet changes
In the `useEffect` that triggers on `lpoNo` change (Phase B), reset the search:

```ts
useEffect(() => {
  setEntrySearch('');
  // ... existing fetchFreshSheet() call
}, [lpoNo]);
```

---

## File Change Summary

| Phase | File | Change Type |
|---|---|---|
| A | `frontend/src/components/LPODetailForm.tsx` | Add `fetchDebounceTimers` ref; format-completion regex + 300ms safety timer; cleanup on unmount |
| B | `frontend/src/components/LPOSheetView.tsx` | Add `lpoNo` prop; add server-fetch `useEffect`; add loading overlay; add `refreshSheet()` |
| B | `frontend/src/components/LPOWorkbook.tsx` | Pass `lpoNo={activeSheet?.lpoNo}` to LPOSheetView |
| C | `backend/src/controllers/lpoSummaryController.ts` | Add `cancelAllEntries` controller function |
| C | `backend/src/routes/lpoSummaryRoutes.ts` | Register `POST /:id/cancel-all` route |
| C | `frontend/src/services/api.ts` | Add `cancelAll` to `lpoDocumentsAPI` |
| C | `frontend/src/components/LPOSheetView.tsx` | Add Cancel LPO button, modal, `handleCancelAll`, state |
| D | `frontend/src/components/LPOSheetView.tsx` | Add `entrySearch` state, `visibleEntries` computed list, search input UI, no-results state |

---

## Execution Order

```
Phase A (LPODetailForm debounce)       ← independent, do first
    ↓
Phase B (Server-side sheet fetch)      ← enables correct data for C and D
    ↓
Phase C (Cancel all) + Phase D (Search) ← both build on top of Phase B, can be done in parallel
```

---

## Notes & Constraints

- **No new collections or schema changes**: Cancel-all reuses the exact same per-entry cancellation logic already in `updateFuelRecordForLPOEntry()`
- **Backward compatible**: Old 1-truck DA LPOs still load and display correctly — the server fetch just returns whatever is in the `LPOSummary` document
- **Phase B fallback**: If `getByLpoNo` fails, the sheet falls back to the prop data — no crash, no blank screen
- **Phase A preserves paste behaviour**: The staggered paste path is untouched; debounce only applies to manual single-character typing
- **Search is client-side**: `entrySearch` filters `editedSheet.entries` in memory — no API call, instant filtering
- **`isCancelled` shown flag on whole LPO**: Optional field — if `LPOSummary` model already has it (check before Phase C backend), set it; if not, the per-entry `isCancelled` flags are sufficient and the LPO-level flag can be skipped to avoid a schema change
