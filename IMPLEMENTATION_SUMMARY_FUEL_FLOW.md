# Fuel Order Management System - Implementation Summary

## Changes Made

### 1. Station Configuration Updates

**Removed Invalid Stations:**
- ~~MBEYA GOING~~ - Use **INFINITY** instead
- ~~MBEYA RETURN~~ - Use **INFINITY** instead  
- ~~TUNDUMA RETURN~~ - Use **LAKE TUNDUMA** instead
- ~~DAR GOING~~ - Kept as fuel record field only, not a station
- ~~DAR RETURN~~ - Kept as fuel record field only, not a station
- ~~MORO RETURN~~ - Use **GBP MOROGORO** instead
- ~~TANGA RETURN~~ - Kept as fuel record field only, not a station

**Valid Stations:**
| Station | Rate | Currency | Usage |
|---------|------|----------|-------|
| LAKE CHILABOMBWE | 1.2 | USD | Zambia Going |
| LAKE NDOLA | 1.2 | USD | Zambia Return (50L) |
| LAKE KAPIRI | 1.2 | USD | Zambia Return (350L) |
| LAKE KITWE | 1.2 | USD | Zambia Going |
| LAKE KABANGWA | 1.2 | USD | Zambia Going |
| LAKE CHINGOLA | 1.2 | USD | Zambia Going |
| LAKE TUNDUMA | 2875 | TZS | Tunduma Return (100L) |
| INFINITY | 2757 | TZS | Mbeya (Going 450L, Return 400L) |
| GBP MOROGORO | 2710 | TZS | Morogoro Return (100L) |
| GBP KANGE | 2730 | TZS | Morogoro Area |
| GPB KANGE | 2730 | TZS | Morogoro (typo version) |
| CASH | Variable | TZS | Variable rate with currency converter |

### 2. Fuel Allocation Logic

**Standard Journey Allocations:**

| Checkpoint | Liters | Notes |
|------------|--------|-------|
| Dar Yard | 550 (or 580) | 580 if loaded at Kisarawe |
| Mbeya Going | 450 | At INFINITY station |
| Zambia Going | Calculated | `(totalLts + extra) - 900` |
| Zambia Return | 400 | Split: 50L (LAKE NDOLA) + 350L (LAKE KAPIRI) |
| Tunduma Return | 100 | At LAKE TUNDUMA |
| Mbeya Return | 400 | At INFINITY station |
| Morogoro Return | 100 | For Mombasa-bound trucks |
| Tanga Return | 70 | For Mombasa-bound trucks |

**Special Destinations:**
- Lusaka: Zambia Going = 60L
- Lubumbashi: Zambia Going = 260L

### 3. Cash Currency Converter

When CASH station is selected, a currency converter appears with:
- **Currency Selection**: ZMW (Zambian Kwacha), USD, CDF
- **Local Rate**: Rate per liter in selected currency
- **Conversion Rate**: TZS per unit of selected currency
- **Calculated Rate**: Final rate in TZS for the LPO

**Example:**
```
Local Rate: 26 ZMW/liter
Conversion Rate: 116 TZS/ZMW
Calculated Rate: 26 × 116 = 3,016 TZS/liter
```

### 4. Extra Fuel Highlighting

Fuel records now highlight cells where fuel exceeds standard allocation:

- **Visual**: Yellow background with ⚠ indicator
- **Tooltip**: Shows extra amount above standard
- **Fields Monitored**:
  - Dar Yard (standard: 550L)
  - Tanga Yard (standard: 100L)
  - Mbeya Going (standard: -450L)
  - Mbeya Return (standard: -400L)
  - Zambia Return (standard: -400L)
  - Tunduma Return (standard: -100L)
  - Morogoro Return (standard: -100L)
  - Tanga Return (standard: -70L)

### 5. Files Modified

**Frontend:**
- `frontend/src/components/LPODetailForm.tsx` - Updated stations, rates, added currency converter
- `frontend/src/pages/FuelRecords.tsx` - Added extra fuel highlighting with legend

**Backend:**
- `backend/src/controllers/lpoSummaryController.ts` - Updated station to fuel field mappings

**Documentation:**
- `FUEL_JOURNEY_FLOW.md` - Complete journey flow documentation

---

## Handling Extra Fuel (Exceptions)

When a driver receives additional fuel beyond the standard allocation, the system:

1. **Records** the fuel in the appropriate checkpoint column
2. **Highlights** the cell in yellow with a warning indicator
3. **Shows** the extra amount on hover
4. **Displays** a legend explaining the highlighting

**Reasons for Extra Fuel:**
- Theft or misuse of allocated fuel
- Vehicle breakdown requiring additional fuel
- Route deviation
- Heavy cargo requiring more fuel
- Emergency situations

**Recommended Actions:**
1. Review highlighted records regularly
2. Document reasons for extra fuel in notes
3. Investigate patterns of extra fuel usage
4. Consider adjusting allocations for specific routes if consistently exceeded

---

## Journey Flow Reference

### Going Journey (Dar → Zambia/DRC)

```
START
  │
  ├─ Tanga Origin?
  │   └─ Yes → Tanga Yard (100L) → Dar Loading
  │   └─ No → Dar Yard (550L or 580L)
  │
  ├─ Dar Going (if not at yard, create LPO)
  │
  ├─ Mbeya Going → INFINITY (450L) → Create LPO
  │
  └─ Zambia Going → LAKE stations → Create LPO
      └─ Amount: (totalLts + extra) - 900
      └─ Exceptions: Lusaka (60L), Lubumbashi (260L)
```

### Return Journey (Zambia/DRC → Dar)

```
START
  │
  ├─ Zambia Return → 2 LPOs:
  │   ├─ LAKE NDOLA (50L)
  │   └─ LAKE KAPIRI (350L)
  │
  ├─ Tunduma Return → LAKE TUNDUMA (100L) → Create LPO
  │
  ├─ Mbeya Return → INFINITY (400L) → Create LPO
  │
  ├─ Morogoro Return (Mombasa-bound) → GBP MOROGORO (100L)
  │
  └─ Tanga Return (Mombasa-bound) → (70L)
```

---

## Testing Checklist

- [ ] Create LPO with INFINITY station (Mbeya checkpoint)
- [ ] Create LPO with LAKE TUNDUMA station
- [ ] Create LPO with CASH and use currency converter
- [ ] Verify fuel record updates correctly for each station
- [ ] Check extra fuel highlighting shows for values exceeding standard
- [ ] Verify Zambia Return split (50L + 350L) creates correct LPOs
- [ ] Test journey from Tanga (100L yard fuel)
- [ ] Test journey from Dar (550L/580L yard fuel)
