# Developer Guide: Migrating Components to Dynamic Stations/Routes

## Quick Reference

### Import the service
```typescript
import { configService } from '../services/configService';
import { FuelStationConfig, RouteConfig } from '../types';
```

### Load stations dynamically
```typescript
const [stations, setStations] = useState<FuelStationConfig[]>([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
  const loadStations = async () => {
    try {
      const data = await configService.getActiveStations();
      setStations(data);
    } catch (error) {
      console.error('Failed to load stations:', error);
      // Fallback to hardcoded list if needed
    } finally {
      setLoading(false);
    }
  };
  loadStations();
}, []);
```

### Use in dropdowns
```typescript
<select>
  <option value="">Select station...</option>
  {stations.map(station => (
    <option key={station._id} value={station.stationName}>
      {station.stationName}
    </option>
  ))}
</select>
```

---

## Component-by-Component Migration Guide

### 1. LPODetailForm.tsx

**Current**: Uses `STATIONS` array and `STATION_DEFAULTS` object

**Migration Steps**:

```typescript
// Add to imports
import { configService } from '../services/configService';

// Add state
const [stations, setStations] = useState<FuelStationConfig[]>([]);
const [stationsMap, setStationsMap] = useState<Map<string, FuelStationConfig>>(new Map());

// Add useEffect
useEffect(() => {
  const loadStations = async () => {
    const data = await configService.getActiveStations();
    setStations(data);
    
    // Create map for quick lookup
    const map = new Map(data.map(s => [s.stationName, s]));
    setStationsMap(map);
  };
  loadStations();
}, []);

// Replace STATION_DEFAULTS lookups
// OLD:
const defaults = STATION_DEFAULTS[station];
const rate = defaults?.rate || 0;

// NEW:
const stationConfig = stationsMap.get(station);
const rate = stationConfig?.defaultRate || 0;
const currency = stationConfig?.defaultRate < 10 ? 'USD' : 'TZS';
```

**Update station dropdown**:
```typescript
<select value={selectedStation} onChange={handleStationChange}>
  <option value="">Select Station...</option>
  {stations.map(s => (
    <option key={s._id} value={s.stationName}>{s.stationName}</option>
  ))}
  <option value="CASH">CASH</option>
  <option value="CUSTOM">CUSTOM</option>
</select>
```

### 2. ManagerView.tsx

**Current**: Uses `ALL_STATIONS`, `EXCLUDED_STATIONS_SUPER`, `STATION_MAPPING`

**Migration Steps**:

```typescript
const [allStations, setAllStations] = useState<string[]>([]);
const [availableStations, setAvailableStations] = useState<string[]>([]);

useEffect(() => {
  const loadStations = async () => {
    const stations = await configService.getStationNames();
    setAllStations(stations);
    
    // Filter based on role
    if (user.role === 'super_manager') {
      // Exclude Tanzania stations for super_manager
      const excluded = ['LAKE TUNDUMA', 'GBP MOROGORO', 'GBP KANGE', 'GPB KANGE', 'INFINITY'];
      const filtered = stations.filter(s => !excluded.includes(s));
      setAvailableStations(filtered);
    } else if (user.role === 'manager') {
      // Show only assigned station
      setAvailableStations([user.station || '']);
    } else {
      setAvailableStations(stations);
    }
  };
  loadStations();
}, [user.role, user.station]);
```

### 3. LPOForm.tsx

**Current**: Uses local `stations` array at line 287+

**Migration Steps**:

```typescript
const [configuredStations, setConfiguredStations] = useState<FuelStationConfig[]>([]);

useEffect(() => {
  const loadStations = async () => {
    const stations = await configService.getActiveStations();
    setConfiguredStations(stations);
  };
  loadStations();
}, []);

// In render:
<select value={selectedStation} onChange={handleStationChange}>
  {configuredStations.map(station => (
    <option key={station._id} value={station.stationName}>
      {station.stationName} - {station.defaultRate}/L
    </option>
  ))}
</select>
```

### 4. lpoForwardingService.ts

**Current**: Uses `FORWARDING_ROUTES` array, `FORWARD_TARGET_STATIONS`

**Migration Steps**:

```typescript
// Update getAvailableForwardingRoutes
export async function getAvailableForwardingRoutes(sourceStation: string) {
  return await configService.getForwardingRoutes(sourceStation);
}

// Update getStationDisplayInfo
export async function getStationDisplayInfo(station: string) {
  const info = await configService.getStationInfo(station);
  if (!info) {
    return {
      name: station,
      rate: 1.2,
      currency: 'USD' as const,
      commonLiters: [100]
    };
  }
  
  return {
    name: station,
    rate: info.rate,
    currency: info.currency,
    commonLiters: [info.defaultLitersGoing, info.defaultLitersReturning].filter(l => l > 0)
  };
}

// Get all target stations
export async function getAllForwardTargetStations(): Promise<string[]> {
  return await configService.getStationNames();
}
```

### 5. ForwardLPOModal.tsx

**Current**: Uses `FORWARD_TARGET_STATIONS`

**Migration Steps**:

```typescript
const [targetStations, setTargetStations] = useState<string[]>([]);

useEffect(() => {
  const loadStations = async () => {
    const stations = await configService.getStationNames();
    // Filter out source station
    const filtered = stations.filter(s => s !== sourceLpo.station);
    setTargetStations(filtered);
  };
  loadStations();
}, [sourceLpo.station]);

// In render:
{targetStations.map(station => (
  <option key={station} value={station}>{station}</option>
))}
```

### 6. cancellationService.ts

**Current**: Uses `GOING_STATIONS`, `RETURNING_STATIONS`

**Migration Steps**:

```typescript
// Create async versions of station getters
export async function getGoingStations(): Promise<string[]> {
  const stations = await configService.getActiveStations();
  return stations
    .filter(s => s.defaultLitersGoing > 0)
    .map(s => s.stationName);
}

export async function getReturningStations(): Promise<string[]> {
  const stations = await configService.getActiveStations();
  return stations
    .filter(s => s.defaultLitersReturning > 0)
    .map(s => s.stationName);
}

// Update functions that use these to be async
export async function getAvailableCancellationPoints(
  journey: 'going' | 'returning'
): Promise<CancellationPoint[]> {
  const goingStations = await getGoingStations();
  const returningStations = await getReturningStations();
  // ... rest of logic
}
```

---

## Migration Checklist

For each component:

- [ ] Import `configService` and types
- [ ] Add state for stations/routes
- [ ] Add loading state
- [ ] Create useEffect to load data
- [ ] Update all hardcoded arrays to use state
- [ ] Update dropdowns to use loaded data
- [ ] Add loading indicators where appropriate
- [ ] Test with empty database
- [ ] Test with seeded data
- [ ] Test create/update/delete operations
- [ ] Check console for errors

---

## Testing

### Test Empty State
```typescript
// In browser console:
localStorage.clear();
configService.clearCache();
location.reload();
```

### Test Loading State
```typescript
// Add artificial delay in configService
await new Promise(resolve => setTimeout(resolve, 2000));
```

### Test Error State
```typescript
// Temporarily break API endpoint or disconnect network
// Verify fallback behavior works
```

---

## Common Patterns

### Pattern 1: Simple Station List
```typescript
const [stations, setStations] = useState<string[]>([]);

useEffect(() => {
  configService.getStationNames().then(setStations);
}, []);
```

### Pattern 2: Full Station Objects
```typescript
const [stations, setStations] = useState<FuelStationConfig[]>([]);

useEffect(() => {
  configService.getActiveStations().then(setStations);
}, []);
```

### Pattern 3: Station Lookup Map
```typescript
const [stationsMap, setStationsMap] = useState<Map<string, FuelStationConfig>>(new Map());

useEffect(() => {
  configService.getActiveStations().then(stations => {
    setStationsMap(new Map(stations.map(s => [s.stationName, s])));
  });
}, []);

// Usage:
const station = stationsMap.get(stationName);
const rate = station?.defaultRate || 0;
```

### Pattern 4: With Error Handling
```typescript
const [stations, setStations] = useState<string[]>([]);
const [error, setError] = useState<string | null>(null);

useEffect(() => {
  const loadStations = async () => {
    try {
      const data = await configService.getStationNames();
      setStations(data);
      setError(null);
    } catch (err) {
      setError('Failed to load stations');
      console.error(err);
    }
  };
  loadStations();
}, []);
```

---

## Performance Tips

1. **Use caching**: configService automatically caches for 5 minutes
2. **Load once**: Use useEffect with empty dependency array
3. **Optimize lookups**: Use Map for O(1) lookups instead of array.find()
4. **Lazy load**: Only load data when component mounts, not on every render
5. **Clear cache**: Call `configService.clearCache()` after mutations

---

## Backward Compatibility

Keep hardcoded fallbacks for critical paths:

```typescript
const FALLBACK_STATIONS = ['INFINITY', 'LAKE NDOLA', 'LAKE KAPIRI'];

useEffect(() => {
  const loadStations = async () => {
    try {
      const data = await configService.getStationNames();
      setStations(data.length > 0 ? data : FALLBACK_STATIONS);
    } catch (error) {
      console.error('Failed to load stations, using fallback:', error);
      setStations(FALLBACK_STATIONS);
    }
  };
  loadStations();
}, []);
```

---

## Example: Complete Component Update

**Before**:
```typescript
export function MyComponent() {
  const STATIONS = ['INFINITY', 'LAKE NDOLA', 'LAKE KAPIRI'];
  const [selected, setSelected] = useState('');
  
  return (
    <select value={selected} onChange={e => setSelected(e.target.value)}>
      {STATIONS.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}
```

**After**:
```typescript
import { useState, useEffect } from 'react';
import { configService } from '../services/configService';

export function MyComponent() {
  const [stations, setStations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState('');
  
  useEffect(() => {
    const loadStations = async () => {
      try {
        const data = await configService.getStationNames();
        setStations(data);
      } catch (error) {
        console.error('Failed to load stations:', error);
        setStations(['INFINITY', 'LAKE NDOLA', 'LAKE KAPIRI']); // Fallback
      } finally {
        setLoading(false);
      }
    };
    loadStations();
  }, []);
  
  if (loading) return <div>Loading...</div>;
  
  return (
    <select value={selected} onChange={e => setSelected(e.target.value)}>
      <option value="">Select station...</option>
      {stations.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}
```

---

**Ready to migrate more components? Follow these patterns and you'll have a fully dynamic system!**
