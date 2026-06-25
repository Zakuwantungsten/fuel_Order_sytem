# LPO Duplicate Check Redesign — Bug Report & Fix Plan

## 1. What the Current Logic Does

### Backend: `checkDuplicateAllocation` (`lpoSummaryController.ts:1888`)

Called for every truck row in the form (500 ms debounce) for **non-CASH stations only**.

```
Query:
  station = selected station (exact, case-insensitive)
  entries.truckNo = this truck (regex, case-insensitive)
  entries.isCancelled ≠ true
  date ≥ today − cashLpoLookbackDays (default 40)
```

Then applies the DO filter in JS:
- **If doNo is provided and ≠ "NIL"** → only matches entries where `entry.doNo === checkDoNo`
  — i.e. flags as duplicate only if this exact same DO appears at this station
- **If doNo is NIL or absent** → matches on truck + station only (no DO filter)

Then computes:
- `hasDuplicate = matchingLpos.length > 0`
- `isDifferentAmount = true` if the new liters differs from ALL existing liters
  — if true, it's treated as a top-up

### Frontend: what is blocked vs. allowed

| Scenario | `isDifferentAmount` | Result |
|---|---|---|
| Same truck + same station + **same liters** | false | ❌ **Blocks submit** + red banner at top |
| Same truck + same station + **different liters** | true | ✅ Allowed — blue "top-up" info banner at top |
| Station is CASH | n/a | ✅ Skipped entirely |

The submit guard is at `LPODetailForm.tsx:2871`:
```ts
const exactDuplicates = Array.from(duplicateWarnings.entries())
  .filter(([_, info]) => !info.isDifferentAmount);
if (exactDuplicates.length > 0) { toast.error(...); return; }
```

---

## 2. The Problems

### Problem A — NIL DOs block submission unnecessarily

When a row's DO is NIL (Driver Account, manual entry, etc.) the check falls back to
**truck + station only**. This catches legitimate entries:

- A truck with NIL DO getting cash fuel at a station it visited 3 weeks ago for a different
  (non-recorded) purpose
- Driver Account entries that recur for the same truck at the same station

Result: user is blocked from submitting for a valid new LPO because of a historical NIL-DO entry.

### Problem B — DO-based check is actually correct but the NIL fallback undoes it

When a real DO is imported, `doNo` uniquely identifies the journey. If the same DO appears at
the same station twice in the lookback window, that IS a true duplicate. The current logic handles
this correctly. The only flaw is the NIL fallback being a hard block.

### Problem C — The lookback setting label is misleading

The `cashLpoLookbackDays` setting in JourneyConfig is labelled **"Cash LPO lookback window"** and
its description only mentions CASH LPO auto-cancellation. But the same `getCashLpoLookbackDays()`
helper is also used in `checkDuplicateAllocation` for non-CASH duplicate checks. The user cannot
know this. The setting and its description need to reflect both uses.

### Problem D — Duplicate warning banners are shown at the top of the form

Two banners appear above the form body (lines 3405–3466):
- Red "Duplicate Allocation - Blocked" banner with the list of flagged trucks
- Blue "Additional Fuel Allocation" banner for different-amount top-ups

These clutter the top of the form and can scroll out of sight. The per-row Status column already
has space for truck-level status. Truck warnings should live there — not in a separate top-level
panel.

---

## 3. Proposed New Logic

### Core rule change

| DO situation | Match criteria | Action |
|---|---|---|
| DO is a real value (not NIL) | Same **DO + station** within lookback window, non-cancelled | **Block** if same liters; **allow (top-up)** if different liters |
| DO is NIL | Same **truck + station + NIL DO** within lookback window, non-cancelled | **Warn only** (never block) |
| Station is CASH | — | Always skip (unchanged) |

### Why this is better than current logic

| Aspect | Current | Proposed |
|---|---|---|
| Non-NIL DO duplicate | Correctly uses DO+station | Same — no change needed |
| NIL DO duplicate | Hard-blocks on truck+station | Warn only — NIL entries are inherently ambiguous |
| Top-up (different liters) | Allowed for both NIL and non-NIL | Same — no change |
| CASH station | Skipped | Same — no change |
| False positives | High for NIL DOs | Eliminated for NIL DOs |
| Missed real duplicates | Possible if DO changed between entries | Same — DO is the ground truth |

### Does this solve everything?

Yes, with one caveat:

- **Real duplicate prevention** is maintained for all entries with a valid DO number. Same DO at
  same station = actual duplicate. This is the case the user called out: "imported DO — DO is unique."
- **NIL entries are freed from false blocks.** They get a soft warning visible in the Status column
  so the user is aware but can still submit.
- **Top-up logic is preserved** exactly as-is.
- **CASH exemption is preserved** exactly as-is.
- **Caveat:** A truck appearing at the same station twice within the lookback window, both times with
  NIL DOs and the same liters, will only warn — it will not block. This is intentional. NIL DO means
  "unidentified journey" and blocking would create more problems than it prevents.

---

## 4. Changes Needed

### 4.1 Backend: `lpoSummaryController.ts` — `checkDuplicateAllocation`

**Location:** lines 1888–1997

Two changes to the filter and response:

**Change 1 — Add `isNilDo` flag to response**

The frontend needs to know whether the match was a NIL-DO match so it can decide warn vs. block.

```ts
// After computing matchingLpos:
const isNilMatch = !checkDoNo || checkDoNo === 'NIL';

res.json({
  ...existing fields...
  isNilDo: isNilMatch,  // NEW: true when the check was based on truck+station only (NIL DO)
});
```

**Change 2 — Rename the helper function** (optional but clarifying)

Rename `getCashLpoLookbackDays` → `getLpoLookbackDays` internally. The DB field name
`cashLpoLookbackDays` doesn't need to change (no migration needed), only the function name and
comments.

No other backend logic changes are required — the existing DO-vs-NIL branching is correct.

---

### 4.2 Frontend: `LPODetailForm.tsx` — duplicate check effect and submit guard

**Location:** lines 1031–1077 (check effect) and 2869–2882 (submit guard)

**Change 1 — Store `isNilDo` in `duplicateWarnings`**

```ts
// existing shape:
{ lpoNo, date, liters, isDifferentAmount, newLiters }

// add one field:
{ lpoNo, date, liters, isDifferentAmount, newLiters, isNilDo: boolean }
```

Populate it from the new API response field:
```ts
warnings.set(entry.truckNo, {
  ...existing fields...,
  isNilDo: result.isNilDo || false,   // NEW
});
```

**Change 2 — Submit guard: NIL-DO duplicates never block**

```ts
// Before:
const exactDuplicates = Array.from(duplicateWarnings.entries())
  .filter(([_, info]) => !info.isDifferentAmount);

// After:
const exactDuplicates = Array.from(duplicateWarnings.entries())
  .filter(([_, info]) => !info.isDifferentAmount && !info.isNilDo);
  //                                                  ^^^^^^^^^^^^
  //  NIL-DO matches only warn; they never block submission
```

**Change 3 — Remove the top-level red/blue banners entirely**

Delete the entire block at lines 3405–3466:
```tsx
{/* Duplicate Allocation Warning Banner */}
{duplicateWarnings.size > 0 && formData.station?.toUpperCase() !== 'CASH' && (() => {
  ...
})()}
```

This block renders the two top-of-form banners. They go away. All duplicate info moves to the
Status column for each truck row (see 4.3 below).

---

### 4.3 Frontend: `LPODetailForm.tsx` — Status column rendering

**What the Status column currently shows:**

- `entryType` badge (DA, REF, NIL, NORM)
- `warningType` badges (not_found, journey_completed, no_active_record, ambiguous_do)
- `warningMessage` text (inline per-row text for within-form duplicates, e.g. "⚠️ DUPLICATE: Truck already in row N")
- Balance / journey info

**What needs to be added:**

When `duplicateWarnings.get(entry.truckNo)` is set for a row, show it in the Status column:

- **Non-NIL exact duplicate** (`!isDifferentAmount && !isNilDo`): show a red badge/label
  e.g. `⛔ Dup: LPO #XXXX (300L)` — this is now the ONLY place this is visible
- **Non-NIL top-up** (`isDifferentAmount && !isNilDo`): show a blue badge
  e.g. `↑ Top-up over LPO #XXXX (300L)`
- **NIL-DO warn** (`isNilDo`): show an amber badge
  e.g. `⚠ NIL seen at station (LPO #XXXX)`

The Status column already handles conditional rendering per row; this is additive.

---

### 4.4 Frontend: `JourneyConfig.tsx` — rename `CashLpoLookbackCard`

**Location:** lines 664–740

Rename the card title and description to reflect that this setting controls BOTH uses:

```
Title: "LPO lookback window"

Description: "How many days back the system searches when:
  (1) Creating a CASH LPO — to find existing allocations at checkpoints for auto-cancellation
  (2) Creating any LPO — to detect duplicate allocations for the same truck at the same station
Increase if journeys routinely take longer than 40 days."
```

No backend change needed — the same `cashLpoLookbackDays` field in `SystemConfig` covers both.

---

## 5. Summary of Files to Touch

| File | Section | Change |
|---|---|---|
| `backend/src/controllers/lpoSummaryController.ts` | `checkDuplicateAllocation` (~line 1979) | Add `isNilDo` to response |
| `frontend/src/services/api.ts` | `checkDuplicateAllocation` return type (~line 749) | Add `isNilDo: boolean` to interface |
| `frontend/src/components/LPODetailForm.tsx` | duplicate check effect (~line 1056) | Store `isNilDo` in warnings map |
| `frontend/src/components/LPODetailForm.tsx` | submit guard (~line 2874) | Exclude NIL-DO matches from block |
| `frontend/src/components/LPODetailForm.tsx` | banner block (~line 3405) | **Delete** the top-level red/blue banners |
| `frontend/src/components/LPODetailForm.tsx` | Status column rendering | Add duplicate badge per row |
| `frontend/src/pages/JourneyConfig.tsx` | `CashLpoLookbackCard` (~line 716) | Rename title + update description |

---

## 6. What Is NOT Changing

- The `cashLpoLookbackDays` DB field name and the `updateCashLpoLookbackDays` API — no migration
- CASH station exemption from duplicate checks
- The within-form truck-number duplicate detection (same truck entered twice in one LPO) — this is a
  separate check at line 2894 and is working correctly
- The `findLPOsAtCheckpoint` logic used for CASH auto-cancellation
- The top-up (different liters) logic — different amount is always allowed regardless of NIL/non-NIL

---

## 7. Open Questions Before Implementation

1. **For same-DO + same-station + different-liters (non-NIL top-up):** should this still be "warn
   only" as it is today? Or should it also block? The current behavior allows it. Proposed keeps it
   allowed. Confirm this is the intent.

2. **NIL-DO warn: should the amber badge be dismissible per row?** Or is a permanent visible
   indicator in the Status column sufficient?

3. **Status column space:** the Status column currently holds several pieces of info. Is there a
   maximum density you want to stay under, or is a small compact badge sufficient?
io