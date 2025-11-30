# LPO Auto-Fetch - Test Scenarios

## Test Data Setup

### Sample Trucks and DOs
```typescript
Truck: T530 DRF
- Going DO: 6376 (IMPORT, destination: Kolwezi)
- Returning DO: 6377 (EXPORT, destination: DAR)

Truck: T148 EGJ
- Going DO: 6530 (IMPORT, destination: Likasi)
- Returning DO: 6531 (EXPORT, destination: DAR)

Truck: T546 EKT
- Going DO: 6415 (IMPORT, destination: Lusaka)
- Returning DO: 6416 (EXPORT, destination: DAR)
```

## Test Scenarios

### Scenario 1: First Fuel - Going Journey at Zambia
**Input:**
- Truck: T530 DRF
- Station: LAKE CHILABOMBWE
- No existing fuel records

**Expected Output:**
- DO Number: 6376 (Going)
- DO Type: going
- Liters: 260 (default for Zambia Going)
- Rate: 1450
- Confidence: High
- Reason: "Truck hasn't taken fuel at LAKE CHILABOMBWE yet, so this is going"

**Result in Fuel Record:**
- `zambiaGoing`: -260

---

### Scenario 2: Return Journey at Same Station
**Input:**
- Truck: T530 DRF
- Station: LAKE CHILABOMBWE
- Existing record shows: zambiaGoing = -260

**Expected Output:**
- DO Number: 6377 (Returning)
- DO Type: returning
- Liters: 0 (not standard, can override)
- Rate: 1450
- Confidence: High
- Reason: "Truck already took fuel at LAKE CHILABOMBWE on going journey, so this is returning"

---

### Scenario 3: LAKE NDOLA (Returning Only)
**Input:**
- Truck: T148 EGJ
- Station: LAKE NDOLA
- Any fuel record state

**Expected Output:**
- DO Number: 6531 (Returning)
- DO Type: returning
- Liters: 50
- Rate: 1450
- Confidence: High
- Reason: "LAKE NDOLA is a returning-only station"

**Result in Fuel Record:**
- `zambiaReturn`: -50

---

### Scenario 4: LAKE KAPIRI (Returning Only)
**Input:**
- Truck: T148 EGJ
- Station: LAKE KAPIRI
- Any fuel record state

**Expected Output:**
- DO Number: 6531 (Returning)
- DO Type: returning
- Liters: 350
- Rate: 1450
- Confidence: High
- Reason: "LAKE KAPIRI is a returning-only station"

**Result in Fuel Record:**
- `zambiaReturn`: Should total -400 (50 from NDOLA + 350 from KAPIRI)

---

### Scenario 5: Special Destination - Lusaka
**Input:**
- Truck: T546 EKT
- Station: CASH
- DO Destination: Lusaka
- Fuel Record: totalLts = 1000, extra = 60

**Expected Output:**
- DO Number: 6415 (Going)
- DO Type: going
- Liters: 60 (special allocation for Lusaka)
- Rate: 1450
- Confidence: High

**Calculation Override:**
- Normal: (1000 + 60) - 900 = 160
- Special Lusaka: 60 liters

---

### Scenario 6: Special Destination - Lubumbashi
**Input:**
- Truck: T530 DRF
- Station: TCC
- DO Destination: Lubumbashi
- Fuel Record: totalLts = 1200, extra = 100

**Expected Output:**
- DO Number: 6376 (Going)
- DO Type: going
- Liters: 260 (special allocation for Lubumbashi)
- Rate: 1450
- Confidence: High

---

### Scenario 7: Mbeya Going Station
**Input:**
- Truck: T148 EGJ
- Station: MBEYA_STATION
- Fuel Record: Going DO exists

**Expected Output:**
- DO Number: 6530 (Going)
- DO Type: going
- Liters: 450
- Rate: 1450
- Confidence: High
- Reason: "MBEYA_STATION is a going-only station"

**Result in Fuel Record:**
- `mbeyaGoing`: -450

---

### Scenario 8: Tunduma Return Station
**Input:**
- Truck: T148 EGJ
- Station: TUNDUMA_STATION
- Fuel Record: Returning DO exists

**Expected Output:**
- DO Number: 6531 (Returning)
- DO Type: returning
- Liters: 100
- Rate: 1450
- Confidence: High
- Reason: "TUNDUMA_STATION is a returning-only station"

**Result in Fuel Record:**
- `tundumaReturn`: -100

---

### Scenario 9: Station Below Zambia Going
**Input:**
- Truck: T530 DRF
- Station: MBEYA_STATION (or TUNDUMA_STATION)
- Truck has both going and returning DOs

**Expected Output:**
- DO Number: 6376 (Going)
- DO Type: going
- Confidence: High
- Reason: "Station is below Zambia Going, so using going DO"

---

### Scenario 10: Only Going DO Available
**Input:**
- Truck: T530 DRF (only has going DO 6376)
- Station: LAKE CHILABOMBWE
- No returning DO created yet

**Expected Output:**
- DO Number: 6376 (Going)
- DO Type: going
- Liters: Calculated from fuel record
- Confidence: Medium
- Reason: "Only going DO available for this truck"

---

### Scenario 11: Manual Override Mode
**Input:**
- Truck: T530 DRF
- Station: CASH
- User enables "Manual Entry Mode"

**Expected Behavior:**
- No auto-fetch triggered
- All fields remain empty for manual entry
- User can enter any DO number
- User can enter any fuel amount
- User can enter any rate

---

### Scenario 12: Unknown Station
**Input:**
- Truck: T530 DRF
- Station: "CUSTOM_STATION" (not in mapping)

**Expected Output:**
- DO Number: 6376 (Going - first available)
- DO Type: going
- Liters: 0 (requires manual entry)
- Confidence: Low
- Reason: "Unknown station, defaulting to going DO"

---

## Validation Tests

### Test 1: Fuel Deduction Accuracy
```typescript
Before LPO Creation:
  zambiaGoing: 0

Create LPO:
  Truck: T530 DRF
  Station: CASH
  DO: 6376
  Liters: 260

After LPO Creation:
  zambiaGoing: -260
```

### Test 2: Multiple LPOs at Different Stations
```typescript
LPO 1: LAKE NDOLA, 50L
LPO 2: LAKE KAPIRI, 350L

Result in Fuel Record:
  zambiaReturn: -400 (cumulative)
```

### Test 3: Mixed Going and Returning
```typescript
Journey Timeline:
1. Going: CASH (260L) → zambiaGoing: -260
2. Going: MBEYA_STATION (450L) → mbeyaGoing: -450
3. Return: LAKE NDOLA (50L) → zambiaReturn: -50
4. Return: LAKE KAPIRI (350L) → zambiaReturn: -400
5. Return: TUNDUMA_STATION (100L) → tundumaReturn: -100
```

---

## Edge Cases

### Edge Case 1: Duplicate LPO at Same Station
**Problem:** Truck tries to get fuel again at LAKE CHILABOMBWE (already filled)

**System Behavior:**
- Detects existing zambiaGoing record
- Switches to returning DO automatically
- Warns with confidence level

### Edge Case 2: Fuel Record Not Found
**Problem:** Creating LPO before fuel record exists

**System Behavior:**
- Auto-fetch still works (finds DO)
- Fuel deduction logs warning but doesn't fail
- LPO is created successfully
- Admin can manually link later

### Edge Case 3: Multiple Active DOs
**Problem:** Truck has 2 going DOs

**Current Behavior:**
- Uses first going DO found
- Confidence: Medium
- User should verify manually

**Future Enhancement:**
- Analyze which DO is most recent
- Check which DO has incomplete fuel records

---

## UI Testing Checklist

- [ ] Auto-fill triggers when truck + station are selected
- [ ] Banner shows correct confidence level (green/yellow/orange)
- [ ] "Use Custom" button toggles to manual mode
- [ ] Manual mode checkbox works independently
- [ ] Loading indicator appears during fetch
- [ ] All fields remain editable even with auto-fill
- [ ] Form submission includes auto-filled data
- [ ] Error handling shows appropriate messages
- [ ] Fuel deduction happens after LPO creation
- [ ] Confidence reason is user-friendly and clear

---

## Performance Considerations

- Auto-fetch should complete within 500ms
- Loading state prevents user confusion
- Failed auto-fetch doesn't block manual entry
- Multiple rapid station changes should debounce
- Large fuel record datasets should be paginated

---

## Accessibility

- Screen readers announce auto-fill results
- Keyboard navigation works for all controls
- Color-blind friendly confidence indicators
- Clear labels for all form fields
- Manual override clearly indicated
