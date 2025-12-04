# Unknown Route Handling - Implementation Guide

## Overview
The system now intelligently handles destinations that are not in the configured routes list, providing multiple fallback mechanisms and user interactions.

## Problem Solved
Previously, unknown destinations would **silently default to 2200L** without any notification to the user, potentially leading to:
- Incorrect fuel allocation
- No tracking of new routes
- No user awareness of missing configuration

## New Features

### 1. **Intelligent Route Matching**

The system uses a 4-tier matching strategy:

#### Tier 1: Exact Match
```
Input: "KOLWEZI"
Match: "KOLWEZI" → 2400L
Result: ✅ Exact match found
```

#### Tier 2: Partial Match (Contains)
```
Input: "KOLWEZI MINE"
Match: "KOLWEZI" → 2400L
Result: ✅ Partial match found
```

#### Tier 3: Fuzzy Match (80%+ similarity)
```
Input: "KOLWEZ" (typo)
Match: "KOLWEZI" → 2400L
Similarity: 85%
Result: ✅ Fuzzy match found (with confirmation)
```

#### Tier 4: Default with Suggestions
```
Input: "NEW_DESTINATION"
No match found
Suggestions:
  • KOLWEZI (2400L) - 45% match
  • KAMOA (2440L) - 30% match
Result: ⚠️ Using default 2200L (with user interaction)
```

### 2. **User Interaction Flow**

#### Scenario A: Unknown Destination (IMPORT DO)

When creating a delivery order for an unknown destination:

```
⚠️ Destination "KIVU" is not in the configured routes.

Using default allocation: 2200L

Did you mean one of these?
  • KIKWI (2200L) - 75% match
  • LIKASI (2200L) - 60% match

You can:
1. Continue with 2200L (default)
2. Enter custom liters for this journey
3. Cancel and check the destination spelling

Enter custom liters (or click Cancel to use 2200L default):
```

**User Options:**
- Click **Cancel** → Use 2200L default
- Enter **custom value** (e.g., 2500) → Use custom value
- If custom value entered, system asks: "Save this route for future use?"

#### Scenario B: Fuzzy Match Found

```
Destination "KOLWEZ" matched to "KOLWEZI" (2400L).

Is this correct?
```

**User Options:**
- Click **Yes** → Use matched value
- Click **No** → Prompt for custom liters

#### Scenario C: Return Journey (EXPORT DO)

For return journeys, unknown destinations are handled automatically:
- Console warning logged
- Suggestions shown in console
- Uses default value (no user interruption)
- Reason: Return DOs are often created in bulk and shouldn't interrupt workflow

### 3. **Route Management UI**

Admins can now manage routes through a dedicated interface:

**Features:**
- ➕ Add new routes
- ✏️ Edit existing routes
- 🗑️ Delete routes
- 🔍 Search/filter routes
- 📊 View all configured routes

**Access:** System Config → Route Management

### 4. **API Methods**

New methods added to `FuelConfigService`:

```typescript
// Get route info with detailed match data
FuelConfigService.getTotalLitersByDestination(destination)
// Returns: { liters, matched, matchType, matchedRoute, suggestions }

// Simplified version (backward compatible)
FuelConfigService.getTotalLitersSimple(destination)
// Returns: number (just the liters)

// Add/Update route
FuelConfigService.addOrUpdateRoute(destination, totalLiters)

// Remove route
FuelConfigService.removeRoute(destination)

// Get all routes
FuelConfigService.getAllRoutes()
// Returns: [{ destination, liters }]
```

## Match Types

| Type | Description | Auto-Use | Confirmation |
|------|-------------|----------|--------------|
| **exact** | Perfect match | ✅ Yes | ❌ No |
| **partial** | Destination contains route name | ✅ Yes | ❌ No |
| **fuzzy** | 80%+ similarity | ✅ Yes | ✅ Yes (user confirms) |
| **default** | No match found | ⚠️ With prompt | ✅ Yes (can enter custom) |

## Fuzzy Matching Algorithm

Uses **Levenshtein Distance** to calculate string similarity:

```typescript
similarity = 1 - (editDistance / maxLength)
```

**Examples:**
- "KOLWEZI" vs "KOLWEZ" → 85% similarity ✅
- "KAMOA" vs "KAMOWA" → 80% similarity ✅
- "LUSAKA" vs "LUBUMBASHI" → 45% similarity ❌ (too different)

**Thresholds:**
- 80%+ → Auto-use with confirmation
- 60-79% → Show as suggestion
- <60% → Not suggested

## Configuration Storage

Routes are stored in browser **localStorage**:

```json
{
  "fuel_system_config": {
    "routeTotalLiters": {
      "LUBUMBASHI": 2100,
      "KOLWEZI": 2400,
      "KAMOA": 2440,
      "CUSTOM_ROUTE": 2500
    }
  }
}
```

## User Workflows

### Workflow 1: First Time Using New Destination

```mermaid
graph TD
    A[Create DO for "KIVU"] --> B{Route exists?}
    B -->|No| C[Show warning popup]
    C --> D{User action}
    D -->|Cancel| E[Use 2200L default]
    D -->|Enter 2600L| F[Use 2600L]
    F --> G{Save route?}
    G -->|Yes| H[Save KIVU→2600L]
    G -->|No| I[Use once only]
    H --> J[Fuel record created]
    I --> J
    E --> J
```

### Workflow 2: Using Saved Custom Route

```mermaid
graph TD
    A[Create DO for "KIVU"] --> B{Route exists?}
    B -->|Yes - 2600L| C[Use 2600L automatically]
    C --> D[Fuel record created]
```

### Workflow 3: Typo in Destination

```mermaid
graph TD
    A[Create DO for "KOLWEZ"] --> B{Exact match?}
    B -->|No| C{Fuzzy match?}
    C -->|Yes - KOLWEZI 85%| D[Show confirmation]
    D --> E{User confirms?}
    E -->|Yes| F[Use KOLWEZI 2400L]
    E -->|No| G[Enter custom liters]
    F --> H[Fuel record created]
    G --> H
```

## Benefits

### For Users
1. ✅ **No silent failures** - Always notified about unknown routes
2. ✅ **Flexibility** - Can enter custom values on the fly
3. ✅ **Learning system** - Can save new routes for future use
4. ✅ **Typo tolerance** - Fuzzy matching handles common mistakes
5. ✅ **Suggestions** - Helps identify correct routes

### For Admins
1. ✅ **Route management UI** - Easy to configure routes
2. ✅ **Growth tracking** - See all custom routes added
3. ✅ **Standardization** - Centralized route configuration
4. ✅ **Audit trail** - Know what routes are being used

### For System
1. ✅ **Data quality** - Accurate fuel allocations
2. ✅ **Expandability** - Easy to add new routes
3. ✅ **Flexibility** - Handles edge cases gracefully
4. ✅ **User experience** - Non-blocking but informative

## Testing Scenarios

### Test 1: Unknown Destination
```
Action: Create DO with destination "NEWPLACE"
Expected: Warning popup with option to enter custom liters
Result: User can proceed with 2200L or custom value
```

### Test 2: Close Typo
```
Action: Create DO with destination "KAMOWA" (should be KAMOA)
Expected: Fuzzy match found, confirmation dialog
Result: User confirms and uses KAMOA (2440L)
```

### Test 3: Save New Route
```
Action: Create DO, enter custom 2650L, agree to save
Expected: Route saved to configuration
Result: Next DO to same destination uses 2650L automatically
```

### Test 4: Route Management
```
Action: Open route management, add "BUKAVU" → 2350L
Expected: Route added to config
Result: All future DOs to BUKAVU use 2350L automatically
```

## Implementation Files

### Modified Files:
1. **`frontend/src/services/fuelConfigService.ts`**
   - Enhanced `getTotalLitersByDestination()` with detailed match info
   - Added `calculateSimilarity()` method
   - Added `addOrUpdateRoute()`, `removeRoute()`, `getAllRoutes()` methods

2. **`frontend/src/services/fuelRecordService.ts`**
   - Updated to use new match info format
   - Added console warnings for unknown routes

3. **`frontend/src/pages/DeliveryOrders.tsx`**
   - Added user interaction for unknown destinations
   - Added route saving functionality
   - Enhanced with match type handling

### New Files:
1. **`frontend/src/components/RouteManagement.tsx`**
   - Complete route management UI
   - Add, edit, delete, search routes
   - Real-time statistics

## Future Enhancements

1. **Backend Integration**
   - Store routes in database instead of localStorage
   - Sync routes across all users
   - Admin-only route management

2. **Analytics**
   - Track most used routes
   - Identify routes needing configuration
   - Fuel consumption analysis by route

3. **Bulk Import**
   - Import routes from Excel/CSV
   - Export current configuration
   - Route templates by region

4. **Distance-Based Calculation**
   - Auto-calculate liters based on distance
   - Consider route difficulty (mountains, border crossings)
   - Dynamic fuel pricing

## Troubleshooting

### Issue: "Route not found" warnings
**Solution:** Add the route through Route Management UI or let system learn from custom entries

### Issue: Fuzzy match wrong destination
**Solution:** Decline confirmation and enter correct liters, or fix spelling in destination field

### Issue: Lost routes after browser clear
**Solution:** Routes are stored in localStorage. Consider backend storage for persistence

### Issue: Too many popups
**Solution:** Pre-configure common routes in Route Management to reduce interruptions
