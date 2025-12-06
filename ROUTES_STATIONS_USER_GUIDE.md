# Routes and Stations Management - User Guide

## Overview
The Super Admin can now manage all fuel stations and routes dynamically through the Configuration tab. No more hardcoded values!

## Accessing Configuration

1. Log in as **Super Admin**
2. Navigate to the **Configuration** tab in the Super Admin dashboard
3. Choose between **Fuel Stations** or **Routes** tabs

---

## Managing Fuel Stations

### View All Stations
- The Configuration tab displays all fuel stations with:
  - Station Name
  - Rate (per liter)
  - Default liters for going and returning
  - Fuel record columns they fill
  - Status (Active/Inactive)

### Add New Station

1. Click **"Add Station"** button
2. Fill in the required fields:
   - **Station Name*** (e.g., LAKE KAPIRI, INFINITY)
   - **Rate (per Liter)*** (e.g., 1.2 for USD, 2757 for TZS)
   - **Default Going Liters*** (e.g., 450)
   - **Default Returning Liters*** (e.g., 400)
   - **Fills Going Column** (optional - select which fuel record column)
   - **Fills Returning Column** (optional)
   - **Going Formula** (optional - for dynamic allocation, e.g., `totalLiters + extraLiters - 900`)
   - **Returning Formula** (optional)
3. Click **"Create"**

### Edit Station

1. Click the **Edit (✏️)** icon next to any station
2. Update the fields as needed
3. Click **"Update"**

### Delete Station

1. Click the **Delete (🗑️)** icon next to any station
2. Confirm the deletion
3. **Warning**: This cannot be undone. Ensure no active LPOs are using this station.

---

## Managing Routes

### View All Routes
- The Routes tab displays:
  - Route Name
  - Starting Point (Origin)
  - Destination
  - Default Total Liters
  - Destination Aliases
  - Description

### Add New Route

1. Click **"Add Route"** button
2. Fill in the required fields:
   
   **Route Name*** (required)
   - Example: "Dar to Kolwezi Route"
   - Descriptive name for the route
   
   **Starting Point (Origin)*** (required) ⭐
   - Example: DAR, TANGA, DSM
   - **Important**: This field is now **required** as it determines fuel allocation
   - Where the journey starts
   
   **Destination*** (required)
   - Example: KOLWEZI, LUSAKA, KITWE
   - Final destination (will be auto-uppercased)
   
   **Destination Aliases** (optional)
   - Example: "DSM, DAR" (comma-separated)
   - Alternative names for the destination
   
   **Default Total Liters*** (required)
   - Example: 2400
   - Default fuel allocation for this route
   
   **Description** (optional)
   - Additional notes about the route

3. Click **"Create"**

### Edit Route

1. Click the **Edit (✏️)** icon next to any route
2. Update the fields as needed
3. Click **"Update"**

### Delete Route

1. Click the **Delete (🗑️)** icon next to any route
2. Confirm the deletion

---

## Understanding Route Structure

### Origin (Starting Point) - Now Required! ⭐

The **Origin** field is critical because it determines:
- Which yard the fuel is dispensed from (DAR, TANGA, MMSA)
- How fuel is allocated across checkpoints
- The route structure: **Origin → Destination**

**Examples:**
- **DAR → KOLWEZI**: Truck starts from Dar es Salaam yard, goes to Kolwezi
- **TANGA → LUSAKA**: Truck starts from Tanga yard, goes to Lusaka
- **DSM → KITWE**: Truck starts from DSM area, goes to Kitwe

### Why Origin Matters

A truck going from **DAR to Kolwezi**:
1. Gets fuel at **DAR Yard** (550L)
2. Refuels at **Mbeya/Infinity** (450L going)
3. Refuels at **Zambia stations** (Chilabombwe, Kitwe, etc.)
4. Returns with fuel at **Zambia stations**, **Tunduma**, **Mbeya**

If the origin is wrong or missing, the fuel allocation will be incorrect!

---

## Using Dynamic Data in the System

### What Changed?

**Before**: Stations and routes were hardcoded in the application code
**Now**: Stations and routes are stored in the database and can be managed via UI

### Benefits

1. ✅ **No Code Changes Needed**: Add new stations/routes via UI
2. ✅ **Real-time Updates**: Changes reflect immediately across the system
3. ✅ **Consistent Data**: Single source of truth
4. ✅ **Super Admin Control**: Full control over system configuration
5. ✅ **Audit Trail**: All changes are logged

### Where Dynamic Data is Used

- **LPO Creation Forms**: Station dropdowns auto-populate
- **Fuel Record Forms**: Routes auto-populate based on destination
- **Manager Views**: Station filtering based on database
- **User Management**: Station assignment for managers
- **Forwarding**: Station selection for LPO forwarding
- **Reports**: All station/route data from database

---

## Formula Help

### Available Variables
When creating custom formulas for stations, you can use:

- `totalLiters` - Total fuel assigned to the truck
- `extraLiters` - Extra fuel allocated
- `destination` - Destination name
- Standard math operators: `+`, `-`, `*`, `/`, `()`

### Example Formulas

**Zambia Going**:
```
totalLiters + extraLiters - 900
```
Calculation: Total fuel + extra - (Dar 550 + Mbeya 450 buffer)

**Mbeya Going**:
```
totalLiters + extraLiters - 550
```
Calculation: Total fuel + extra - Dar 550

**Percentage-based**:
```
totalLiters * 0.8
```
Calculation: 80% of total fuel

---

## Seeded Data

The system comes pre-configured with:

### 11 Fuel Stations
- **Zambia (USD $1.2/L)**: LAKE CHILABOMBWE, LAKE NDOLA, LAKE KAPIRI, LAKE KITWE, LAKE KABANGWA, LAKE CHINGOLA
- **Tanzania (TZS)**: LAKE TUNDUMA (2875), INFINITY (2757), GBP MOROGORO (2710), GBP KANGE (2730), GPB KANGE (2730)

### 16 Routes
- 9 routes from **DAR**
- 5 routes from **TANGA**
- 2 routes from **DSM**

All covering major Zambian and DRC destinations with 2400L default fuel capacity.

---

## Best Practices

### Adding Stations
1. Use **UPPERCASE** for station names (e.g., LAKE KAPIRI, not Lake Kapiri)
2. Set appropriate rates based on currency (USD < 10, TZS > 1000)
3. Configure formulas for stations with dynamic allocation
4. Link stations to correct fuel record columns

### Adding Routes
1. ⭐ **Always specify the Starting Point (Origin)** - It's required!
2. Use descriptive route names (e.g., "Dar to Kolwezi Route")
3. Add destination aliases for common variations
4. Set realistic default liter values (typically 2400L for long routes)
5. Include helpful descriptions

### Maintenance
1. Review and update stations/routes quarterly
2. Archive inactive routes by setting `isActive = false`
3. Keep station rates up-to-date with fuel price changes
4. Test new stations/routes in a development environment first

---

## Troubleshooting

### Station not appearing in dropdowns
- Check if the station is marked as **Active**
- Clear browser cache and refresh
- Verify the station was created successfully

### Route not found in fuel record creation
- Ensure the destination matches exactly (case-insensitive)
- Check destination aliases are configured
- Verify route is marked as **Active**

### Fuel allocation seems wrong
- Verify the **Origin** field is set correctly on the route
- Check station formulas are correct
- Review default liter values

### Changes not reflecting immediately
- The system uses 5-minute caching
- Force refresh: Ctrl+F5 (Windows) or Cmd+Shift+R (Mac)
- Wait a few minutes for cache to expire

---

## Support

For technical issues or questions:
1. Check the audit log for recent configuration changes
2. Review the DYNAMIC_ROUTES_STATIONS_COMPLETE.md documentation
3. Contact your system administrator

---

**Last Updated**: December 6, 2025  
**Version**: 1.0
