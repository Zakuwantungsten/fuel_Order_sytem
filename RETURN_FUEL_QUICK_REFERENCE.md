# Return Journey Fuel Calculation - Quick Reference

## 🚚 How It Works

When a truck gets a return delivery order (EXPORT DO), the system **automatically calculates** if additional fuel is needed.

## 📋 What Gets Calculated

### 1. **Base Fuel Difference**
```
If return loading point requires MORE fuel than originally allocated:
  Additional Fuel = (Required Liters) - (Original Liters)

Example:
  Original: 2300L for going journey
  Return from KAMOA needs: 2440L
  Difference: 2440 - 2300 = 140L added
```

### 2. **Special Loading Point Extras**
When loading from these mining sites, **extra fuel is automatically added**:

| Loading From | Extra Fuel |
|-------------|-----------|
| 🏔️ **KAMOA** | +40 liters |
| 🏔️ **NMI** | +20 liters |
| 🏔️ **KALONGWE** | +60 liters |

### 3. **Special Destination Extras**
When returning to:

| Final Destination | Extra Fuel |
|------------------|-----------|
| 🏙️ **MOSHI (MSA)** | +170 liters |

## 💡 Real Examples

### Example 1: Simple Return
```
Going: DAR → KOLWEZI (2300L)
Return: KOLWEZI → KAMOA → DAR

Calculation:
  DAR → KAMOA needs: 2440L
  Already have: 2300L
  Difference: +140L
  Kamoa extra: +40L
  ═══════════════
  TOTAL ADDED: 180L
  New total: 2480L ✅
```

### Example 2: Return to Moshi
```
Going: MOSHI → LIKASI (2200L)
Return: LIKASI → NMI → MOSHI

Calculation:
  Already have enough: 0L
  NMI extra: +20L
  Moshi extra: +170L
  ═══════════════
  TOTAL ADDED: 190L
  New total: 2390L ✅
```

### Example 3: No Extra Needed
```
Going: DAR → KOLWEZI (2400L)
Return: KOLWEZI → LUBUMBASHI → DAR

Calculation:
  Already have enough: 0L
  No special extras: 0L
  ═══════════════
  TOTAL ADDED: 0L
  No change ✅
```

## 🔍 Spelling Tolerance

The system **recognizes location names** even with typos:

✅ **KAMOA** also matches:
- `KAMOWA` (typo)
- `KAMO` (short)
- `kamoa` (lowercase)

✅ **MOSHI** also matches:
- `MOSH` (short)
- `MSA` (abbreviation)
- `moshi` (lowercase)

✅ **KALONGWE** also matches:
- `KALONGW` (short)
- `KALONG` (short)
- `kalongwe` (lowercase)

## 📱 What You'll See

When creating a return DO, you'll get an alert showing:

```
Fuel record updated with return DO-6868

📊 Additional Fuel Allocated: 180L
New Total: 2480L (was 2300L)

Breakdown:
Base difference: 140L (2440L needed - 2300L original)
Loading point extra (KAMOA): +40L
```

## ⚙️ Admin Configuration

System admins can adjust the extra fuel amounts in the configuration panel.

## 🎯 Key Points

1. ✅ **Fully Automatic** - No manual calculation needed
2. ✅ **Transparent** - Shows exact breakdown
3. ✅ **Smart Matching** - Handles typos automatically
4. ✅ **Accurate** - Based on actual route requirements
5. ✅ **Configurable** - Admins can adjust values

## 📞 Support

If the calculation seems incorrect:
1. Check the spelling of the loading point
2. Verify the original fuel allocation
3. Contact system admin if values need adjustment
