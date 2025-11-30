# Fuel Order Management System - Complete Journey Flow Documentation

## Overview

This document details the complete fuel allocation process for trucks traveling from Tanzania to Zambia/DRC and back. It covers the standard allocation flow, exceptions, and how to handle special situations.

---

## Table of Contents

1. [Journey Origins](#journey-origins)
2. [Going Journey Fuel Allocation](#going-journey-fuel-allocation)
3. [Return Journey Fuel Allocation](#return-journey-fuel-allocation)
4. [Stations and Rates](#stations-and-rates)
5. [LPO Creation Rules](#lpo-creation-rules)
6. [Handling Exceptions](#handling-exceptions)
7. [Balance Calculation](#balance-calculation)

---

## Journey Origins

A truck's journey can start from two locations:

### 1. Starting from Tanga
- **Tanga Yard**: 100 liters given to reach Dar es Salaam
- **Dar es Salaam Loading**: 550 liters (standard) or 580 liters (if loaded at Kisarawe)
- **Note**: Yard fuel is company fuel - NO LPO created for yard dispensing

### 2. Starting from Dar es Salaam
- **Dar Yard**: 550 liters (standard) or 580 liters (if loaded at Kisarawe)
- **Alternative**: If truck doesn't fill at yard but somewhere within Dar, the amount is recorded in "Dar Going" column and an LPO IS created for this

---

## Going Journey Fuel Allocation

### Standard Flow (Dar → Zambia/DRC)

| Checkpoint | Station Name | Standard Liters | Notes |
|------------|-------------|-----------------|-------|
| **1. Dar es Salaam (Yard)** | N/A | 550 or 580 | Company fuel, no LPO |
| **2. Dar Going** | CASH or other | Variable | Only if not filled at yard. LPO created. |
| **3. Morogoro Going** | GBP MOROGORO or GBP KANGE | - | Rarely used on going trip |
| **4. Mbeya Going** | INFINITY | 450 | LPO created at Infinity station |
| **5. Tunduma Going** | LAKE TUNDUMA | - | Rarely used on going trip |
| **6. Zambia Going** | LAKE stations | Calculated | See calculation below |
| **7. Congo Fuel** | Various | Variable | For DRC destinations only |

### Zambia Going Calculation

**Standard Formula:**
```
Zambia Going = (Total Liters + Extra) - 900
```

**Where:**
- 900 = Dar Yard (550) + Mbeya Going (450) - Some buffer/adjustment

**Exceptions by Destination:**
| Destination | Zambia Going Liters |
|-------------|-------------------|
| Standard (Kolwezi, etc.) | (totalLts + extra) - 900 |
| Lusaka | 60 liters (fixed) |
| Lubumbashi | 260 liters (fixed) |
| Kapiri Mposhi (Kpm) | Variable (often 360-400) |

### Example Going Journey (2200L Total, 100L Extra)

1. **Start at Dar Yard**: -550 liters
2. **Mbeya Going (INFINITY)**: -450 liters
3. **Zambia Going**: -(2200 + 100 - 900) = -400 liters
4. **Balance for return**: 900 liters

---

## Return Journey Fuel Allocation

### Standard Flow (Zambia/DRC → Dar)

| Checkpoint | Station Name | Standard Liters | Notes |
|------------|-------------|-----------------|-------|
| **1. Zambia Return** | LAKE NDOLA + LAKE KAPIRI | 400 total | Split into 2 LPOs |
| **2. Tunduma Return** | LAKE TUNDUMA | 100 | Single LPO |
| **3. Mbeya Return** | INFINITY | 400 | Single LPO |
| **4. Morogoro Return** | GBP MOROGORO | 100 | For Mombasa-bound trucks |
| **5. Dar Return** | Various | Variable | If needed |
| **6. Tanga Return** | Various | 70 | For Mombasa-bound trucks |

### Zambia Return Split

**IMPORTANT**: Zambia Return is 400 liters split into TWO separate LPOs:

| Station | Liters | Rate |
|---------|--------|------|
| LAKE NDOLA | 50 | 1.2 (USD) |
| LAKE KAPIRI | 350 | 1.2 (USD) |

### Special Return Scenarios

**Mombasa-bound Trucks:**
- Morogoro Return: 100 liters (GBP MOROGORO)
- Tanga Return: 70 liters (GBP KANGE)

**Dar-bound Trucks:**
- Dar Return: Variable (if needed)

---

## Stations and Rates

### Complete Station List with Correct Rates

| Station | Location | Rate | Currency | Field Mapping |
|---------|----------|------|----------|---------------|
| **INFINITY** | Mbeya | 2757 | TZS | mbeyaGoing / mbeyaReturn |
| **LAKE TUNDUMA** | Tunduma | 2875 | TZS | tundumaReturn |
| **LAKE NDOLA** | Zambia | 1.2 | USD | zambiaReturn |
| **LAKE KAPIRI** | Zambia | 1.2 | USD | zambiaReturn |
| **LAKE CHILABOMBWE** | Zambia | 1.2 | USD | zambiaGoing |
| **LAKE KITWE** | Zambia | 1.2 | USD | zambiaGoing |
| **LAKE KABANGWA** | Zambia | 1.2 | USD | zambiaGoing |
| **LAKE CHINGOLA** | Zambia | 1.2 | USD | zambiaGoing |
| **GBP MOROGORO** | Morogoro | 2710 | TZS | moroGoing / moroReturn |
| **GBP KANGE** | Tanga Area | 2730 | TZS | moroGoing / **tangaReturn** |
| **GPB KANGE** | (Typo version) | 2730 | TZS | moroGoing / **tangaReturn** |
| **CASH** | Various | Variable | Variable | Based on direction |

### Stations REMOVED (Invalid)
- ~~MBEYA GOING~~ → Use **INFINITY**
- ~~MBEYA RETURN~~ → Use **INFINITY**
- ~~TUNDUMA RETURN~~ → Use **LAKE TUNDUMA**
- ~~DAR GOING~~ → Keep as checkpoint field, not station
- ~~DAR RETURN~~ → Keep as checkpoint field, not station
- ~~MORO RETURN~~ → Use **GBP MOROGORO**
- ~~TANGA RETURN~~ → Keep as checkpoint field, not station

---

## LPO Creation Rules

### When LPO is Created

| Scenario | LPO Created? | Notes |
|----------|-------------|-------|
| Yard fuel (Dar, Tanga, MMSA) | **NO** | Company fuel |
| Fuel at registered station | **YES** | Standard process |
| Cash purchase at roadside | **YES** | With currency conversion |
| Emergency fuel purchase | **YES** | Record with note |

### LPO Fields

```
LPO No: Sequential number
Date: Purchase date
Station: Station name from approved list
Order Of: Company name (e.g., "TAHMEED")
Entries: [
  {
    DO No: Delivery Order number (or "NIL")
    Truck No: Vehicle registration
    Liters: Amount in liters
    Rate: Price per liter
    Amount: Liters × Rate
    Dest: Destination (or "NIL")
  }
]
Total: Sum of all entry amounts
```

---

## Handling Exceptions

### 1. Driver's Extra Fuel Addition

**Causes:**
- Theft or misuse of allocated fuel
- Vehicle breakdown requiring additional fuel
- Route deviation
- Heavy cargo requiring more fuel

**Recording Method:**
- Add extra fuel to the appropriate checkpoint column
- **HIGHLIGHT** the cell with extra fuel (visual indicator)
- Record note explaining the reason

**Visual Indicator:**
- Cells with fuel amount exceeding the standard allocation should be highlighted in **YELLOW** or **ORANGE**
- This flags records for review

### 2. Cash Purchases

When "CASH" payment mode is selected:
- Input the **rate per liter** in local currency
- Input the **currency conversion rate** (e.g., 1 USD = 116 ZMW)
- System calculates the final rate in TZS for the LPO

**Example:**
```
Local Rate: 26 ZMW/liter
Conversion: 116 ZMW = 1 USD
USD Rate: 26/116 = 0.224 USD/liter
If converting to TZS: 0.224 × 2500 = 560 TZS/liter
```

### 3. Breakdown/Emergency Fuel

- Record in the nearest checkpoint column
- Create LPO with station as "CASH" or actual station used
- Add note explaining the emergency

### 4. Alternative Loading Points

Loading points change but are tracked:
- **Dar Standard**: 550 liters
- **Kisarawe**: 580 liters
- **Other**: Record actual amount given

### 5. Return Without Full Allocation

If truck returns with remaining balance:
- Don't allocate full return fuel
- Adjust based on remaining balance
- Balance = TotalLts + Extra + (all allocations as negative)

---

## Balance Calculation

### Formula

```
Balance = (Total Liters + Extra) + Sum of All Allocations
```

Where all allocations are recorded as **negative** values.

### Example Journey (2400L Total, 60L Extra)

| Field | Liters | Running Balance |
|-------|--------|-----------------|
| Total + Extra | +2460 | 2460 |
| Dar Yard | -550 | 1910 |
| Mbeya Going | -450 | 1460 |
| Zambia Going | -560 | 900 |
| Zambia Return | -400 | 500 |
| Tunduma Return | -100 | 400 |
| Mbeya Return | -400 | 0 |
| **Final Balance** | | **0** |

---

## Fuel Record Field Reference

### Yard Allocations (Company Fuel - No LPO)
- `mmsaYard`: MMSA Yard dispensing
- `tangaYard`: Tanga Yard dispensing  
- `darYard`: Dar es Salaam Yard dispensing

### Going Checkpoints (LPO Created)
- `darGoing`: Dar es Salaam (if not at yard)
- `moroGoing`: Morogoro area stations
- `mbeyaGoing`: Mbeya (INFINITY station)
- `tdmGoing`: Tunduma (going) - rarely used
- `zambiaGoing`: Zambia stations (LAKE stations)
- `congoFuel`: DRC fuel allocation

### Return Checkpoints (LPO Created)
- `zambiaReturn`: Zambia return (LAKE NDOLA + LAKE KAPIRI)
- `tundumaReturn`: Tunduma (LAKE TUNDUMA)
- `mbeyaReturn`: Mbeya (INFINITY station)
- `moroReturn`: Morogoro return (GBP stations)
- `darReturn`: Dar es Salaam return
- `tangaReturn`: Tanga return (for Mombasa-bound)

---

## Best Practices

1. **Always verify truck's current journey** before creating LPO
2. **Check destination** to determine correct fuel allocation
3. **Split Zambia Return** into two LPOs (LAKE NDOLA + LAKE KAPIRI)
4. **Flag extra fuel** with highlighting for review
5. **Use correct station names** - no "going/return" in station name
6. **Verify rates** - different currencies for different stations

---

## Quick Reference Card

### Standard Allocations
| Checkpoint | Station | Going | Return |
|------------|---------|-------|--------|
| Dar | Yard/CASH | 550/580 | Variable |
| Morogoro | GBP stations | - | 100 |
| Mbeya | INFINITY | 450 | 400 |
| Tunduma | LAKE TUNDUMA | - | 100 |
| Zambia | LAKE stations | Calculated | 400 (50+350) |

### Rates Quick Reference
| Station | Rate | Currency |
|---------|------|----------|
| INFINITY | 2757 | TZS |
| LAKE TUNDUMA | 2875 | TZS |
| GBP MOROGORO | 2710 | TZS |
| GBP KANGE | 2730 | TZS |
| LAKE stations | 1.2 | USD |
