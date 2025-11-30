# LPO Creation - Quick Reference Guide

## 🚀 Quick Start

### Creating an LPO (Auto Mode - Recommended)

1. **Click "New LPO Entry"**
2. **Select Station** (e.g., LAKE CHILABOMBWE, LAKE NDOLA, CASH, TCC)
3. **Enter Truck Number** (e.g., T530 DRF)
4. ✨ **System automatically fills:**
   - DO Number (going or returning)
   - Fuel Amount (liters)
   - Rate per Liter
   - Destination
5. **Review the auto-filled data**
   - Check the green/yellow banner for confidence level
   - Read the reason provided
6. **Make adjustments if needed** (all fields are editable)
7. **Click "Create LPO Entry"**

---

## 🎯 Understanding Auto-Fill

### Confidence Levels

| Icon | Color | Meaning | Action |
|------|-------|---------|--------|
| ✅ | Green | High Confidence | Trust the auto-fill |
| ⚠️ | Yellow | Medium Confidence | Review before submitting |
| 🔶 | Orange | Low Confidence | Verify manually |

### What the System Checks

1. **Truck's current journey status** (going or returning)
2. **Station type** (going-only, returning-only, or mixed)
3. **Fuel already taken** at this checkpoint
4. **Special destinations** (Lusaka, Lubumbashi)

---

## 📍 Station Types

### Returning-Only Stations
These **always** use the returning DO:
- LAKE NDOLA (50 liters)
- LAKE KAPIRI (350 liters)
- TUNDUMA STATION (100 liters)

### Going-Only Stations
These **always** use the going DO:
- MBEYA STATION (450 liters)

### Mixed Stations (Smart Detection)
System determines direction based on fuel records:
- LAKE CHILABOMBWE
- CASH
- TCC
- ZHANFEI
- KAMOA
- COMIKA

**Logic:** If truck already took fuel here on going → use returning DO

---

## 🔧 Manual Mode

### When to Use Manual Mode

- Unknown truck/DO in the system
- Custom fuel amounts needed
- Unusual station or scenario
- Testing or corrections

### How to Enable

1. Check **"Manual Entry Mode"** checkbox
2. All auto-fill is disabled
3. Enter all fields manually
4. Submit as normal

---

## 📊 Default Fuel Amounts

### Zambia Stations (Going Journey)
| Station | Standard Amount | Special Cases |
|---------|----------------|---------------|
| LAKE CHILABOMBWE | 260 liters | Lusaka: 60L, Lubumbashi: 260L |
| CASH | 260 liters | Lusaka: 60L, Lubumbashi: 260L |
| TCC | 260 liters | Lusaka: 60L, Lubumbashi: 260L |
| ZHANFEI | 260 liters | - |
| KAMOA | 260 liters | - |
| COMIKA | 260 liters | - |

**Calculated Amount:** (Total Liters + Extra) - 900

### Zambia Stations (Returning Journey)
| Station | Amount |
|---------|--------|
| LAKE NDOLA | 50 liters |
| LAKE KAPIRI | 350 liters |

**Total:** 400 liters split across 2 stations

### Tanzania Stations
| Station | Journey | Amount |
|---------|---------|--------|
| MBEYA STATION | Going | 450 liters |
| TUNDUMA STATION | Returning | 100 liters |

---

## 💡 Common Scenarios

### Scenario: First Time at Zambia (Going)
```
Truck: T530 DRF
Station: CASH
Result: Going DO, 260 liters
```

### Scenario: Return Journey at Zambia
```
Truck: T530 DRF
Station: CASH
Already filled: Yes (zambiaGoing = -260)
Result: Returning DO, 0 liters (manual entry needed)
```

### Scenario: Lusaka Destination
```
Truck: T546 EKT
Station: LAKE CHILABOMBWE
Destination: Lusaka
Result: Going DO, 60 liters (special)
```

### Scenario: Return Fuel Split
```
Create 2 LPOs:
1. LAKE NDOLA: 50L
2. LAKE KAPIRI: 350L
Total: 400L for returning journey
```

---

## ⚙️ What Happens Behind the Scenes

### When You Submit an LPO

1. ✅ **LPO is created** in the system
2. ✅ **Fuel is deducted** from the fuel record
3. ✅ **Checkpoint updated** (e.g., zambiaGoing, zambiaReturn)
4. ✅ **Record is saved** with negative fuel values

### Example Flow
```
Before:
  Fuel Record for DO 6376
  - zambiaGoing: 0
  - mbeyaGoing: 0

Create LPO at CASH: 260L

After:
  Fuel Record for DO 6376
  - zambiaGoing: -260
  - mbeyaGoing: 0
```

---

## 🔄 Overriding Auto-Fill

### Method 1: Edit Auto-Filled Values
- Fields are always editable
- Change any value before submitting
- Auto-fill is just a starting point

### Method 2: Use Custom Button
- Click **"Use Custom"** in the banner
- Switches to manual mode
- Re-enable auto-fill by unchecking "Manual Entry Mode"

### Method 3: Manual Entry Mode
- Check **"Manual Entry Mode"** at the top
- Completely bypass auto-fill
- Enter everything from scratch

---

## ❓ Troubleshooting

### "No DO found for this truck"
**Solution:** 
- Create a Delivery Order first
- Or use Manual Entry Mode

### "Low confidence" warning
**Solution:**
- Review the auto-filled values
- Verify truck number and station
- Use manual mode if unsure

### Wrong DO auto-selected
**Solution:**
- Click "Use Custom" or enable Manual Mode
- Enter correct DO number
- Report issue to admin

### Fuel amount seems wrong
**Solution:**
- Check special destination rules (Lusaka, Lubumbashi)
- Verify fuel record exists for this truck
- Override with correct amount

### Can't find my station
**Solution:**
- Contact admin to add station to system
- Use Manual Entry Mode temporarily

---

## 📝 Best Practices

### ✅ DO
- Let auto-fill work first (saves time)
- Review confidence level and reason
- Check fuel amount makes sense
- Keep Manual Mode for exceptions
- Report consistent auto-fill errors

### ❌ DON'T
- Ignore confidence warnings
- Skip reviewing auto-filled data
- Use Manual Mode by default
- Create duplicate LPOs at same station
- Submit without checking destination

---

## 🎓 Training Tips

### For New Users
1. Start with high-confidence scenarios
2. Use known trucks with complete DOs
3. Try returning-only stations first (easier)
4. Practice with Manual Mode to understand fields
5. Learn to read confidence indicators

### For Power Users
1. Memorize station types
2. Understand special destination rules
3. Know when to override defaults
4. Monitor fuel record impacts
5. Report system improvements

---

## 📞 Support

### When Auto-Fill Fails
- Use Manual Mode to complete the LPO
- Note the truck, station, and error
- Report to system admin

### Feature Requests
- New stations to add
- Different default amounts
- Special destination rules
- Custom calculation logic

---

## 🔐 Security Notes

- Auto-fill doesn't prevent manual entry
- All LPOs are logged and auditable
- Fuel deductions are permanent (review carefully)
- Manual overrides are tracked

---

## 📈 System Benefits

### Time Savings
- ⏱️ 70% faster LPO creation
- ❌ Fewer lookup errors
- ✅ Automatic DO selection

### Accuracy
- 🎯 Correct DO (going/returning)
- 📊 Consistent fuel amounts
- 🔄 Automatic fuel tracking

### Transparency
- 📝 Shows reasoning
- ⚠️ Warns on low confidence
- 🔍 Traceable decisions

---

## Quick Reference Card

```
┌─────────────────────────────────────────┐
│  LPO AUTO-FILL QUICK CARD               │
├─────────────────────────────────────────┤
│                                         │
│  STEP 1: Select Station ▼              │
│  STEP 2: Enter Truck Number            │
│  STEP 3: Review Auto-Fill ✨            │
│  STEP 4: Submit ✅                      │
│                                         │
│  CONFIDENCE:                            │
│  ✅ Green  = Trust it                   │
│  ⚠️  Yellow = Review it                 │
│  🔶 Orange = Verify it                  │
│                                         │
│  MANUAL MODE: For special cases         │
│  CHECK: "Manual Entry Mode" ☑️          │
│                                         │
│  OVERRIDE: Click "Use Custom"           │
│                                         │
└─────────────────────────────────────────┘
```
