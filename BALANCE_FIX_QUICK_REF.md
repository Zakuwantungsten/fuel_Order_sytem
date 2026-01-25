# Balance Recalculation Fix - Quick Reference

## What Was Fixed
✅ Balance formula now **consistently applied** at every update  
✅ Works correctly for **locked records** with missing config  
✅ Updates when **routes change** (DO updates)  
✅ Updates on **manual entry** of any field

## Formula
```
Balance = (totalLiters + extraFuel) - (All Checkpoints)
```

## When Balance Recalculates

| Action | Recalculates? | Location |
|--------|--------------|----------|
| Manual entry of totalLts/extra | ✅ Yes | Fuel Record Update |
| Manual entry of checkpoint | ✅ Yes | Fuel Record Update |
| Route updated (DO change) | ✅ Yes | DO Controller |
| LPO created | ✅ Yes | LPO Controller |
| Yard fuel dispensed | ✅ Yes | Yard Fuel Controller |
| Config filled (unlock) | ✅ Yes | Fuel Record Update |

## Verification

### Check All Records
```bash
cd backend
npm run verify:balance
```

### Fix Incorrect Balances
```bash
cd backend
npm run migrate:fuel-logic
```

## Files Changed
1. `backend/src/controllers/fuelRecordController.ts` - Main update logic
2. `backend/src/controllers/deliveryOrderController.ts` - Route updates
3. `backend/src/scripts/verifyBalanceCalculation.ts` - Verification script

## Expected Results

### ✅ Locked Record with Fuel Allocated
- Balance correctly calculated when config filled in later
- No more permanent negative balances

### ✅ Route Updates
- Balance updates when totalLiters changes
- Formula maintained after route recalculation

### ✅ Manual Entry
- Balance updates immediately on any field change
- Works for both locked and unlocked records

## Troubleshooting

### Negative Balance Appearing
1. Run verification: `npm run verify:balance`
2. Check if config is missing (locked record)
3. Run migration if needed: `npm run migrate:fuel-logic`

### Balance Not Updating
1. Check backend logs for "Recalculating balance" message
2. Verify all checkpoint fields are positive numbers
3. Ensure frontend is sending updates correctly

### Incorrect Balance Value
1. Manually calculate: (totalLts + extra) - (sum of checkpoints)
2. Compare with actual balance
3. Run verification script to find all discrepancies

---

**Quick Test:** Update any checkpoint field → Balance should recalculate instantly ✅
