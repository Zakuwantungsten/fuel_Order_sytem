# LPO Detail Form — Mobile UI Redesign Spec

Source file: `frontend/src/components/LPODetailForm.tsx`  
Target: match the mobile mockup screenshot (warm cream/card-based design)

No logic changes. All business logic (truck lookup, autofill, DO matching, CASH cancellation, forwarding, validation) stays exactly as-is. This is a pure presentation layer change.

---

## 1. Color Palette

Replace the current gray/white Tailwind palette on mobile with these warm tones:

| Token | Hex | Usage |
|---|---|---|
| `bg-cream` | `#F5F0E8` | Modal background, page fill |
| `bg-card` | `#FDFAF4` | Individual entry cards |
| `bg-card-hover` | `#F7F2E9` | Card hover / focus |
| `text-label` | `#9B8F7E` | Small ALL-CAPS field labels |
| `text-primary` | `#2D2520` | Main text, truck number |
| `text-muted` | `#B0A090` | Secondary info (DO ref, balance) |
| `border-card` | `#E8E0D0` | Card and section borders |
| `accent-orange` | `#E8900A` | "Create LPO" button fill |
| `accent-orange-hover` | `#D07A08` | Button hover |
| `going-pill-bg` | `#EDE8DF` | GOING direction chip |
| `going-pill-text` | `#5C4A2A` | GOING chip text |
| `returning-pill-bg` | `#DDEAF7` | RETURNING chip bg |
| `returning-pill-text` | `#1D4E8F` | RETURNING chip text |
| `active-badge-bg` | `#DCFCE7` | ACTIVE status badge |
| `active-badge-text` | `#166534` | ACTIVE badge text |
| `active-dot` | `#22C55E` | Animated dot in ACTIVE badge |
| `warning-bg` | `#FFFBEB` | Return DO warning banner bg |
| `warning-border` | `#FCD34D` | Warning banner border |
| `warning-text` | `#92400E` | Warning banner text |

These are only applied inside `md:hidden` (mobile view). Desktop table view is unchanged.

---

## 2. Modal Wrapper

**Current** (`line ~3098`):
```
fixed inset-0 bg-black/50 flex items-start sm:items-center …
  bg-white dark:bg-gray-800 rounded-none sm:rounded-lg …
```

**New (mobile only — `< md`)**:
- Modal container: `bg-[#F5F0E8]` instead of `bg-white`
- Remove `p-6` padding from `<form>` on mobile; use `px-4` instead
- The form should feel like a native mobile sheet, not a dialog

---

## 3. Sticky Header (Top Bar)

**Current** (`line ~3112`): plain white sticky bar with title + X + draft badge

**New**:
```
[ X ]   LOCAL PURCHASE ORDER        • DRAFT SAVED
        New LPO Document
```

Layout:
- Top row of three: `[X icon left]` · `[centered label "LOCAL PURCHASE ORDER" in 10px all-caps tracking-widest text-[#9B8F7E]]` · `[DRAFT SAVED badge right]`
- Second row: `"New LPO Document"` (18px bold `text-[#2D2520]`) left-aligned with 16px left padding
- `DRAFT SAVED` badge: green dot (6px, animated pulse `bg-green-500`) + "DRAFT SAVED" text in 10px tracking-wide, wrapped in a pill `bg-green-50 border border-green-200 rounded-full px-2.5 py-1 text-green-700`
- Bottom of header: thin `border-b border-[#E8E0D0]`
- "Discard Draft" stays but moves to a small text-link below the header, not a button

---

## 4. ORDER DETAILS Section

**Current**: gray `bg-gray-50` card with a 2×2 grid of labeled inputs

**New**: white-ish card `bg-[#FDFAF4] rounded-2xl border border-[#E8E0D0] p-4 mb-4`

Add a section divider label above it:
```
ORDER DETAILS ─────────────────
```
Rendered as: `<div class="flex items-center gap-3 mb-3"><span class="text-[10px] tracking-widest text-[#9B8F7E] font-semibold uppercase">ORDER DETAILS</span><hr class="flex-1 border-[#E8E0D0]"/></div>`

### 4a. LPO Number field

**Current**: labeled input, readonly, gray background

**New**:
- Label: `LPO NUMBER` in 9px all-caps `text-[#9B8F7E]`
- Value: `2740/26` in 22px bold `text-[#2D2520]`
- AUTO badge: small pill right-aligned: `[🔒 icon 12px] AUTO` in 10px, `bg-[#F0EBE0] text-[#8A7A65] rounded-full px-2 py-0.5`
- The input itself becomes a display-only `<div>` on mobile (still an `<input>` underneath for form submission)
- Spinner (loading state) replaces the AUTO badge when `isLoadingLpoNumber` is true

### 4b. Date + Order Of

**Current**: two full-width labeled inputs stacked

**New**: side-by-side in a `grid grid-cols-2 gap-3 mt-3`
- DATE: calendar icon `📅` (or lucide `Calendar` 14px `text-[#9B8F7E]`) + date formatted as `"19 Jun 2026"` (use `new Date(formData.date).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })`) — tappable, opens the hidden `<input type="date">`
- ORDER OF: plain text input, value "TAHMEED", 13px bold

### 4c. Station Card

**Current**: button-dropdown with a text label

**New**: replace with a tappable card row:
```
[ 🔥 icon ]  INFINITY                    [ 1.28 / L ]  [ ˅ ]
             Mbeya · USD account
```
Structure:
- Outer: `bg-[#FFF8ED] border border-[#E8C87A] rounded-xl p-3 flex items-center gap-3 mt-3`
- Left icon: fuel pump icon `Fuel` 20px in a 36px circle `bg-[#F5820A]/10 text-[#F5820A]`
- Middle: `<div class="flex-1"><p class="text-sm font-bold text-[#2D2520]">{stationName}</p><p class="text-xs text-[#9B8F7E]">{location} · {currency} account</p></div>`
  - Location comes from `station.location` if it exists on the station config, otherwise omit
  - Currency comes from `stationConfig.currency`
- Right: rate badge `<span class="text-xs font-semibold bg-[#F5820A]/10 text-[#F5820A] rounded-full px-2 py-1">{rate} / L</span>`
- Chevron: `ChevronDown` 16px `text-[#9B8F7E]`, rotates 180° when dropdown is open
- The dropdown panel below this card stays functionally identical — just re-skin with warm tones

When no station is selected, show a placeholder: `"Select station…"` in muted text, no rate badge, no location.

---

## 5. FUEL SUPPLY Section Header

**Current** (`line ~3917`): `<h3>Fuel Supply Details</h3>` with a duplicate-check spinner

**New**:
```
FUEL SUPPLY ──────────────────  [ 810 L ]
```
- Same divider pattern as ORDER DETAILS
- Total liters pill on the right: `<span class="text-xs font-semibold bg-[#E8E0D0] text-[#5C4A2A] rounded-full px-3 py-1">{totalLiters} L</span>`
- `totalLiters` = `(formData.entries||[]).filter(Boolean).reduce((s,e)=>s+e.liters,0)`
- The duplicate-check spinner moves inside this pill when `isCheckingDuplicates` is true

---

## 6. Entry Cards (Mobile — inside `md:hidden`)

This is the largest change. The current entry cards at lines `3998–4161` are rebuilt.

### 6a. Card shell

**Current**: `border rounded-lg p-2` with colored borders per state

**New**:
```tsx
<div className={`rounded-2xl border mb-3 overflow-hidden transition-all ${cardBorderClass}`}>
```

Border/background variants (same logic as current, just new colors):
| State | Border | Background |
|---|---|---|
| Default / unfetched | `border-[#E8E0D0]` | `bg-[#FDFAF4]` |
| Fetched OK | `border-[#BDE8C8]` | `bg-[#F4FBF6]` |
| Warning (no record) | `border-[#FCD34D]` | `bg-[#FFFDF5]` |
| Exact duplicate | `border-red-300` | `bg-red-50` |
| DA entry | `border-blue-200` | `bg-blue-50/30` |
| REF entry | `border-orange-200` | `bg-orange-50/30` |

### 6b. Card top row — number + truck + status + delete

```
 01   T447 DVL                 • ACTIVE   [🗑]
```

Structure: `<div class="flex items-center gap-2 px-3 pt-3 pb-2">`

- **Number**: `<span class="text-[11px] font-bold text-[#B0A090] w-5 shrink-0">{String(index+1).padStart(2,'0')}</span>`
- **Truck input**: same `handleTruckNoChange` / `handleTruckPaste` handlers, but styled as:
  ```
  text-[15px] font-bold text-[#2D2520] bg-transparent border-none outline-none
  placeholder:text-[#C0B5A5] flex-1 min-w-0 tracking-wide
  ```
  On focus: underline the text with `border-b border-[#E8C87A]` instead of a box
- **Status badge** (replaces the old direction toggle for display; keep direction toggle as secondary action):
  - `ACTIVE` (direction=going, fetched, no warning): green pill `• ACTIVE` — `<span class="inline-flex items-center gap-1 text-[10px] font-semibold bg-[#DCFCE7] text-[#166534] rounded-full px-2 py-0.5"><span class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>ACTIVE</span>`
  - `RETURNING` (direction=returning, fetched): blue pill — `<span class="text-[10px] font-semibold bg-[#DDEAF7] text-[#1D4E8F] rounded-full px-2 py-0.5">RETURNING</span>`
  - `QUEUED` (selectedJourneyType=queued): amber pill — `⏳ QUEUED`
  - `LOADING` (autoFill.loading): spinner instead of badge
  - `WARNING` (hasNoRecordWarning): `⚠ NO RECORD` amber pill
  - `DA` / `REF`: existing DA/REF badges, same colors
  - Tapping the status badge still calls `toggleDirection(index)` (same behavior as current direction button)
- **Delete button**: `<button onClick={()=>handleRemoveEntry(index)} class="ml-auto p-1.5 text-[#C0B5A5] hover:text-red-500 rounded-lg hover:bg-red-50"><Trash2 size={15}/></button>`

### 6c. Direction + route row

```
  GOING   DAR → KOLWEZI · DO 1748/26
```

**New sub-row**: `<div class="flex items-center gap-2 px-3 pb-2">`

- Direction chip (tappable, calls `toggleDirection`):
  - Going: `<button class="text-[10px] font-bold uppercase tracking-wide bg-[#EDE8DF] text-[#5C4A2A] rounded px-2 py-0.5">GOING</button>`
  - Returning: `<button class="text-[10px] font-bold uppercase tracking-wide bg-[#DDEAF7] text-[#1D4E8F] rounded px-2 py-0.5">RETURN</button>`
- Route display (read-only, from autoFill data):
  - Going: `{autoFill.fuelRecord?.from || 'DAR'} → {autoFill.goingDestination || entry.dest || '—'}`  
  - Returning: `{autoFill.fuelRecord?.to || '—'} → DAR`
  - Styled: `text-[11px] font-medium text-[#5C4A2A]`
- DO reference: `· DO {entry.doNo}` in `text-[10px] text-[#9B8F7E]` — or the DO input field if not yet fetched

**DO input field** (when truck is not yet fetched / doNo is empty):
- Keep as an `<input>` with `placeholder="DO #"` and same `handleDONoChange` handler
- Style: `text-[11px] border-b border-[#E8E0D0] bg-transparent outline-none text-[#2D2520] w-20`

**Hint text** (empty card, no truck entered yet):
- Below the inputs: `<p class="text-[10px] text-[#B0A090] px-3 pb-2">Paste a column of trucks to add in bulk</p>`
- Show only when `!entry.truckNo`

### 6d. Inline warning banner

**Current**: warning text is a small `<div>` at `line ~4082`

**New**: a dedicated banner row inside the card, between the route row and the data row:

```
  ⚠  Return DO pending — add before submit
```

```tsx
{autoFill.direction === 'returning' && autoFill.returnDoMissing && autoFill.fetched && (
  <div className="mx-3 mb-2 flex items-center gap-2 rounded-lg border border-[#FCD34D] bg-[#FFFBEB] px-3 py-2">
    <AlertTriangle className="w-3.5 h-3.5 text-[#D97706] shrink-0" />
    <span className="text-[11px] text-[#92400E]">Return DO pending — add before submit</span>
  </div>
)}
```

Other warning types (no record found, exact duplicate, different amount) also get this banner treatment with appropriate colors:
- No record / no active journey: amber banner (same colors as above)
- Exact duplicate: red banner `bg-red-50 border-red-300 text-red-800`
- Different amount (top-up): blue banner `bg-blue-50 border-blue-200 text-blue-800`

### 6e. Data row (Liters / Rate / Amount)

**Current**: `grid grid-cols-4` with labels Ltrs / Rate / Amt / Dest

**New**: `grid grid-cols-3` (drop Dest from this row on mobile — move Dest to a collapsed detail or keep as a 4th col only when not NIL)

```
LITERS          RATE            AMOUNT
450             1.20            USD 540.00
```

Structure: `<div class="grid grid-cols-3 gap-1 px-3 pb-3 pt-1 border-t border-[#F0EBE0]">`

Each cell:
```tsx
<div>
  <label className="block text-[9px] font-semibold uppercase tracking-widest text-[#9B8F7E] mb-0.5">
    {label}
  </label>
  <input className="w-full text-[13px] font-semibold text-[#2D2520] bg-transparent border-b border-[#E8E0D0] outline-none focus:border-[#E8900A] py-0.5" ... />
</div>
```

Amount cell: read-only, no border, shows currency prefix:
```tsx
<div>
  <label className="block text-[9px] font-semibold uppercase tracking-widest text-[#9B8F7E] mb-0.5">AMOUNT</label>
  <p className="text-[13px] font-semibold text-[#2D2520]">
    {currency} {(entry.amount||0).toFixed(2)}
  </p>
</div>
```

When entry amount is 0 or entry not yet fetched, amount text is `text-[#B0A090]`.

**Dest field**: keep as a 4th hidden input but only show visually when `entry.dest && entry.dest !== 'NIL'`. If shown, it appears below the 3-col row as a small tag: `<span class="ml-3 text-[10px] text-[#9B8F7E]">→ {entry.dest}</span>`

### 6f. Journey navigation (Active / Queued buttons)

**Current**: small pill buttons above the data row

**New**: keep the same pill buttons but style as:
```
bg-[#E8E0D0] text-[#5C4A2A] rounded px-2 py-0.5 text-[10px] font-medium
```
Active selection: `bg-[#2D2520] text-white`  
Place these between the direction row and warning banner.

### 6g. Inspect (Eye) button

**Current**: standalone button next to delete

**New**: move into the direction row, right-aligned, small:
```tsx
{autoFill.fuelRecord && (
  <button onClick={()=>handleInspectRecord(index)} className="ml-auto p-1 text-[#9B8F7E] hover:text-blue-500">
    <Eye size={14}/>
  </button>
)}
```

### 6h. Balance info hint (Infinity return)

**Current**: small text below data row

**New**: same position but styled as a small inline tag:
```tsx
<div className="px-3 pb-2 text-[10px] text-[#9B8F7E] flex items-center gap-1">
  <Fuel size={11}/> {autoFill.balanceInfo.suggestedLiters}L available
</div>
```

---

## 7. Empty Entry Row (last unfilled card)

**Current**: same card with tiny text inputs

**New**: lighter card that looks like an invite to type:
- `bg-transparent border-2 border-dashed border-[#D8D0C0] rounded-2xl p-3`
- Number badge: `03` in muted gray
- Truck input: `placeholder="Truck no."` in large muted font, no border box
- DO input: `placeholder="DO #"` same style
- Both inputs side by side in a flex row
- Hint below: `"Paste a column of trucks to add in bulk"` in 10px italic muted

---

## 8. Add Entry Button

**Current** (`line ~4163`): dashed border button with `Add new entry`

**New**: same dashed style but warm-toned:
```tsx
<button className="w-full py-3.5 rounded-2xl border-2 border-dashed border-[#D8D0C0] text-[#9B8F7E] text-sm font-medium flex items-center justify-center gap-1.5 hover:bg-[#F0EBE0] transition-colors mt-1">
  <Plus size={15}/> ADD ENTRY
</button>
```

---

## 9. Sticky Footer (ORDER TOTAL + Action Buttons)

**Current** (`line ~4587`): total display in a primary-colored card above the form action buttons

**New**: fixed bottom bar (mobile only), sitting outside the scrollable form area:

```
ORDER TOTAL
USD 972.00                  810 L
                            2 TRUCKS
[ → FORWARD ]    [ Create LPO ]
```

Implementation:
- Wrapper: `sticky bottom-0 left-0 right-0 bg-[#F5F0E8] border-t border-[#E8E0D0] px-4 pt-3 pb-4 z-10` (inside the form div, after all entries)
- Label: `<p class="text-[10px] font-semibold uppercase tracking-widest text-[#9B8F7E] mb-1">ORDER TOTAL</p>`
- Two-column flex:
  - Left: `<p class="text-[26px] font-bold text-[#2D2520] leading-none">{currency} {total}</p>`
  - Right: `<div class="text-right"><p class="text-[13px] font-semibold text-[#5C4A2A]">{totalLiters} L</p><p class="text-[10px] text-[#9B8F7E]">{truckCount} TRUCKS</p></div>`
- Button row: `flex gap-2 mt-2`
  - **FORWARD** button:
    ```
    border border-[#2D2520] rounded-xl px-4 py-3 text-sm font-semibold text-[#2D2520] bg-transparent flex items-center gap-1.5
    ```
    Shows for new LPOs (same conditions as current `Create & Forward` button). When `isCreatingAndForwarding`: spinner + "Creating…"
  - **Create LPO** button (or "Update LPO" for edits):
    ```
    flex-1 bg-[#E8900A] hover:bg-[#D07A08] rounded-xl px-4 py-3 text-sm font-semibold text-white disabled:opacity-40
    ```
    Same `type="submit"` and disabled conditions as current

Remove the old standalone Total display card (`line ~4588`) and the old action button row (`line ~4610`) on mobile — they are replaced by this sticky bar.

---

## 10. CASH / CUSTOM Station Panels

These sections appear below ORDER DETAILS when CASH or CUSTOM is selected. Visual updates only:

- **CASH panel**: keep same structure. Restyle: `bg-[#FFF9ED] border border-[#F5D78A] rounded-2xl p-4 mb-4` (warm amber instead of orange)
- **CUSTOM panel**: `bg-[#F5F0FF] border border-[#D4C5F0] rounded-2xl p-4 mb-4` (same purple but softer)
- All inputs within these panels get the same underline-only style used in entry cards

---

## 11. Forwarding Mode Banner

**Current** (`line ~3101`): blue banner at top of modal

**New**: same info but in the new warm style:
```
bg-[#EDF4FF] border-b border-[#BFDBFE] text-[#1E40AF] px-4 py-2.5 text-xs font-medium
```
Content stays the same: `→ Forwarded from LPO #{forwardedFromInfo.lpoNo} at {forwardedFromInfo.station}`

---

## 12. Duplicate / Error Banners

**Current** (`line ~3146`): red/blue info cards above the form

**New**: same cards but placed above the entry list (inside the form scroll area), using the warm card style:
- Error (exact dup): `bg-red-50 border border-red-200 rounded-2xl p-3 mb-3`
- Info (different amount): `bg-[#EDF4FF] border border-[#BFDBFE] rounded-2xl p-3 mb-3`
- Typography inside: same as current

---

## 13. Desktop Table View (unchanged)

Everything inside `<div className="hidden md:block …">` at `line ~4173` stays completely unchanged. The redesign is mobile-only.

---

## 14. Implementation Order

1. **Header bar** (section 3) — small, isolated, easy win
2. **ORDER DETAILS card + field reskins** (section 4) — affects LPO#, Date, OrderOf, Station
3. **FUEL SUPPLY divider + total liters pill** (section 5)
4. **Sticky footer** (section 9) — extract from inline position; add `pb-[130px]` to scroll area to prevent content hiding behind it
5. **Entry card shell + top row** (section 6a–6b) — truck input and status badge
6. **Direction + route row** (section 6c)
7. **Inline warning banner** (section 6d)
8. **Data row (Liters/Rate/Amount)** (section 6e)
9. **Empty entry row** (section 7)
10. **Add Entry button** (section 8)
11. **CASH/CUSTOM panel reskins** (section 10)
12. **Forward banner + duplicate banners** (sections 11–12)

---

## 15. New Data Needs (minor)

- **Station location string**: the station card shows `"Mbeya · USD account"`. This needs either:
  - A `location` field on `FuelStationConfig` (already may exist — check the type)
  - OR derive it from `station.stationName` heuristics (e.g., "INFINITY" → "Mbeya")
  - Fallback: show only `"{currency} account"` if no location is available
- **Currency derivation**: already available via `stationConfig.currency ?? (rate < 10 ? 'USD' : 'TZS')` (same logic as `line ~3327`)
- **Route `from` field**: the direction row shows `DAR → KOLWEZI`. The `from` city for going trucks is always "DAR" for this company. For returning, `from` is the destination city. `fuelRecord.from` or `fuelRecord.originalGoingTo` can supply this. No new API calls needed.

---

## 16. Tailwind Config

If the exact hex values in section 1 aren't in the current Tailwind config, add them to `tailwind.config.js` under `theme.extend.colors`:

```js
colors: {
  cream: {
    DEFAULT: '#F5F0E8',
    card: '#FDFAF4',
    border: '#E8E0D0',
    label: '#9B8F7E',
    muted: '#B0A090',
  },
  lpo: {
    orange: '#E8900A',
    'orange-hover': '#D07A08',
    going: { bg: '#EDE8DF', text: '#5C4A2A' },
    returning: { bg: '#DDEAF7', text: '#1D4E8F' },
  }
}
```

Alternatively, use arbitrary Tailwind values (`bg-[#F5F0E8]`) throughout — no config change required but less maintainable.
