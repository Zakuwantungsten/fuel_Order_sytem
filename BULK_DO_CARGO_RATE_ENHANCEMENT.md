# Bulk DO Creation Enhancement: Cargo Type & Rate Structure

## Problem Statement

Currently, the bulk DO creation form has limitations:

1. **Cargo Type**: Always defaults to "LOOSE CARGO" in `containerNo` field, but sometimes we need "CONTAINER"
2. **Rate Structure**: Assumes per-ton pricing (tonnage × rate per ton), but sometimes we have a fixed total amount for the entire DO (not weight-based)

## Requirements

1. Allow selection between "LOOSE CARGO" and "CONTAINER" cargo types
2. Support two rate calculation methods:
   - **Per Ton** (existing): `tonnage × ratePerTon = total`
   - **Fixed Total** (new): Single total amount (no per-ton calculation)
3. Maintain backward compatibility with existing DOs
4. Handle both scenarios in frontend parsing, backend processing, and database storage

---

## Solution Design

### Database Changes

#### Option 1: Use Existing Fields (Recommended)
**Advantages**: No schema migration needed, backward compatible

**Implementation**:
- **`cargoType`**: Already exists in schema, use it to store "loosecargo" or "container"
- **`rateType`**: Add new optional field to distinguish rate calculation method
  - Values: "per_ton" (default) | "fixed_total"
- **`tonnages`**: 
  - For per-ton: actual tonnage
  - For fixed-total: set to 0 or 1 as indicator
- **`ratePerTon`**: 
  - For per-ton: rate per ton
  - For fixed-total: total amount
- **`totalAmount`**: New computed/stored field for clarity

**Database Schema Addition**:
```typescript
// backend/src/types/index.ts - IDeliveryOrder interface
export interface IDeliveryOrder {
  // ... existing fields ...
  cargoType?: 'loosecargo' | 'container';  // Already exists
  rateType?: 'per_ton' | 'fixed_total';     // NEW
  totalAmount?: number;                      // NEW - computed or stored
}

// backend/src/models/DeliveryOrder.ts - Schema
rateType: {
  type: String,
  enum: ['per_ton', 'fixed_total'],
  default: 'per_ton',
},
totalAmount: {
  type: Number,
  min: [0, 'Total amount cannot be negative'],
},
```

#### Option 2: Add New Fields (Alternative)
- Add `isFlatRate: boolean`
- Add `flatRateAmount: number`
- Keep existing fields for per-ton calculation

---

### Frontend Changes

#### 1. BulkDOForm Component (`frontend/src/components/BulkDOForm.tsx`)

**Update State Interface**:
```typescript
const [commonData, setCommonData] = useState({
  // ... existing fields ...
  cargoType: 'loosecargo' as 'loosecargo' | 'container',  // NEW
  rateType: 'per_ton' as 'per_ton' | 'fixed_total',       // NEW
  containerNo: 'LOOSE CARGO',  // Keep for backward compatibility
});
```

**Update BulkDORow Interface**:
```typescript
interface BulkDORow {
  truckNo: string;
  trailerNo: string;
  driverName: string;
  tonnages: number;      // For per-ton or set to 0/1 for fixed
  ratePerTon: number;    // Rate per ton OR total amount
  totalAmount?: number;  // NEW - for display/clarity
}
```

**Add UI Controls**:
```tsx
{/* Cargo Type Selection */}
<div>
  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
    Cargo Type *
  </label>
  <select
    name="cargoType"
    value={commonData.cargoType}
    onChange={(e) => {
      const cargoType = e.target.value as 'loosecargo' | 'container';
      setCommonData(prev => ({ 
        ...prev, 
        cargoType,
        containerNo: cargoType === 'container' ? 'CONTAINER' : 'LOOSE CARGO'
      }));
    }}
    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md"
  >
    <option value="loosecargo">Loose Cargo</option>
    <option value="container">Container</option>
  </select>
</div>

{/* Rate Type Selection */}
<div>
  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
    Rate Structure *
  </label>
  <select
    name="rateType"
    value={commonData.rateType}
    onChange={(e) => setCommonData(prev => ({ 
      ...prev, 
      rateType: e.target.value as 'per_ton' | 'fixed_total'
    }))}
    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md"
  >
    <option value="per_ton">Per Ton Rate</option>
    <option value="fixed_total">Fixed Total Amount</option>
  </select>
  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
    {commonData.rateType === 'per_ton' 
      ? 'Calculate: Tonnage × Rate Per Ton'
      : 'Single fixed amount per DO'}
  </p>
</div>
```

**Update Bulk Data Parsing**:
```typescript
const parseBulkData = () => {
  try {
    if (!bulkInput.trim()) {
      alert('Please enter truck data to parse');
      return;
    }
    
    const lines = bulkInput.trim().split('\n');
    const rows: BulkDORow[] = [];

    for (const line of lines) {
      const parts = line.split('\t').map(p => p.trim());
      
      if (commonData.rateType === 'per_ton') {
        // Format: Truck | Trailer | Driver | Tonnage | Rate Per Ton
        if (parts.length >= 5) {
          const tonnage = parseFloat(parts[3]) || 0;
          const rate = parseFloat(parts[4]) || 0;
          rows.push({
            truckNo: parts[0],
            trailerNo: parts[1],
            driverName: parts[2],
            tonnages: tonnage,
            ratePerTon: rate,
            totalAmount: tonnage * rate,
          });
        }
      } else {
        // fixed_total: Format: Truck | Trailer | Driver | Total Amount
        if (parts.length >= 4) {
          const totalAmount = parseFloat(parts[3]) || 0;
          rows.push({
            truckNo: parts[0],
            trailerNo: parts[1],
            driverName: parts[2],
            tonnages: 0,  // Or 1 as indicator
            ratePerTon: totalAmount,  // Store total in ratePerTon for now
            totalAmount: totalAmount,
          });
        }
      }
    }

    if (rows.length === 0) {
      const expectedFormat = commonData.rateType === 'per_ton'
        ? 'Truck No | Trailer No | Driver Name | Tonnage | Rate Per Ton'
        : 'Truck No | Trailer No | Driver Name | Total Amount';
      alert(`No valid data found. Please ensure data is tab-separated:\n${expectedFormat}`);
      return;
    }
    
    setParsedRows(rows);
    alert(`✓ Successfully parsed ${rows.length} truck entries`);
  } catch (error) {
    console.error('Error parsing bulk data:', error);
    alert('Error parsing data. Please check the format and try again.');
  }
};
```

**Update generateDOs Function**:
```typescript
const generateDOs = async () => {
  try {
    // ... existing validation ...
    
    const startNum = parseInt(commonData.startingNumber) || 0;
    
    const orders: Partial<DeliveryOrder>[] = parsedRows.map((row, index) => ({
      sn: index + 1,
      date: commonData.date,
      importOrExport: commonData.importOrExport,
      doType: commonData.doType,
      doNumber: (startNum + index).toString(),
      clientName: commonData.clientName,
      truckNo: row.truckNo,
      trailerNo: row.trailerNo,
      driverName: row.driverName,
      containerNo: commonData.containerNo,
      cargoType: commonData.cargoType,  // NEW
      rateType: commonData.rateType,    // NEW
      loadingPoint: commonData.loadingPoint,
      destination: commonData.destination,
      haulier: commonData.haulier || '',
      // Rate handling based on type
      tonnages: commonData.rateType === 'per_ton' ? row.tonnages : 0,
      ratePerTon: row.ratePerTon,  // Either rate per ton or total amount
      totalAmount: row.totalAmount,
    }));

    // ... rest of the function ...
  } catch (error) {
    console.error('Error generating DOs:', error);
    alert('Error creating DOs. Check console for details.');
  }
};
```

**Update Preview Table**:
```tsx
{/* Preview table showing parsed data */}
{parsedRows.length > 0 && (
  <div className="mt-4 overflow-x-auto">
    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
      <thead className="bg-gray-50 dark:bg-gray-700">
        <tr>
          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Truck</th>
          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Trailer</th>
          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Driver</th>
          {commonData.rateType === 'per_ton' && (
            <>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300">Tonnage</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300">Rate/Ton</th>
            </>
          )}
          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300">Total</th>
        </tr>
      </thead>
      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
        {parsedRows.map((row, idx) => (
          <tr key={idx}>
            <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-100">{row.truckNo}</td>
            <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-100">{row.trailerNo}</td>
            <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-100">{row.driverName}</td>
            {commonData.rateType === 'per_ton' && (
              <>
                <td className="px-3 py-2 text-sm text-right text-gray-900 dark:text-gray-100">{row.tonnages}</td>
                <td className="px-3 py-2 text-sm text-right text-gray-900 dark:text-gray-100">{row.ratePerTon}</td>
              </>
            )}
            <td className="px-3 py-2 text-sm text-right font-medium text-gray-900 dark:text-gray-100">
              {row.totalAmount?.toLocaleString()}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)}
```

**Update Instructions Text**:
```tsx
<p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
  <strong>Format:</strong> Paste tab-separated data from Excel/Spreadsheet
</p>
<p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
  {commonData.rateType === 'per_ton' 
    ? 'Required columns: Truck No | Trailer No | Driver Name | Tonnage | Rate Per Ton'
    : 'Required columns: Truck No | Trailer No | Driver Name | Total Amount'}
</p>
<p className="text-xs text-gray-500 dark:text-gray-400">
  Example: T538 EKT [TAB] T637 ELE [TAB] John Doe [TAB] {commonData.rateType === 'per_ton' ? '32 [TAB] 185' : '5920'}
</p>
```

#### 2. Single DOForm Component (`frontend/src/components/DOForm.tsx`)

**Add same fields to single DO creation**:
```tsx
{/* Cargo Type */}
<div>
  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
    Cargo Type
  </label>
  <select
    name="cargoType"
    value={formData.cargoType || 'loosecargo'}
    onChange={(e) => {
      const cargoType = e.target.value;
      setFormData(prev => ({ 
        ...prev, 
        cargoType,
        containerNo: cargoType === 'container' ? 'CONTAINER' : 'LOOSE CARGO'
      }));
    }}
    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md"
  >
    <option value="loosecargo">Loose Cargo</option>
    <option value="container">Container</option>
  </select>
</div>

{/* Rate Type */}
<div>
  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
    Rate Structure
  </label>
  <select
    name="rateType"
    value={formData.rateType || 'per_ton'}
    onChange={(e) => setFormData(prev => ({ ...prev, rateType: e.target.value }))}
    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md"
  >
    <option value="per_ton">Per Ton Rate</option>
    <option value="fixed_total">Fixed Total Amount</option>
  </select>
</div>

{/* Conditional fields based on rate type */}
{formData.rateType === 'per_ton' ? (
  <>
    <div>
      <label>Tonnages *</label>
      <input
        type="number"
        name="tonnages"
        value={formData.tonnages || ''}
        onChange={handleChange}
        required
      />
    </div>
    <div>
      <label>Rate Per Ton *</label>
      <input
        type="number"
        name="ratePerTon"
        value={formData.ratePerTon || ''}
        onChange={handleChange}
        required
      />
    </div>
    <div className="text-sm text-gray-600 dark:text-gray-400">
      Total: {((formData.tonnages || 0) * (formData.ratePerTon || 0)).toLocaleString()}
    </div>
  </>
) : (
  <div>
    <label>Total Amount *</label>
    <input
      type="number"
      name="ratePerTon"
      value={formData.ratePerTon || ''}
      onChange={handleChange}
      required
      placeholder="Enter fixed total amount"
    />
  </div>
)}
```

#### 3. Update TypeScript Types (`frontend/src/types/index.ts`)

```typescript
export interface DeliveryOrder {
  // ... existing fields ...
  cargoType?: 'loosecargo' | 'container';
  rateType?: 'per_ton' | 'fixed_total';
  totalAmount?: number;
}
```

---

### Backend Changes

#### 1. Update Types (`backend/src/types/index.ts`)

```typescript
export interface IDeliveryOrder {
  // ... existing fields ...
  cargoType?: 'loosecargo' | 'container';
  rateType?: 'per_ton' | 'fixed_total';
  totalAmount?: number;
}
```

#### 2. Update Model (`backend/src/models/DeliveryOrder.ts`)

```typescript
const deliveryOrderSchema = new Schema<IDeliveryOrderDocument>(
  {
    // ... existing fields ...
    
    cargoType: {
      type: String,
      enum: ['loosecargo', 'container'],
      default: 'loosecargo',
      trim: true,
    },
    rateType: {
      type: String,
      enum: ['per_ton', 'fixed_total'],
      default: 'per_ton',
    },
    totalAmount: {
      type: Number,
      min: [0, 'Total amount cannot be negative'],
    },
    
    // ... rest of fields ...
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (_doc: any, ret: any) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        
        // Compute totalAmount on the fly if not stored
        if (!ret.totalAmount && ret.rateType === 'per_ton') {
          ret.totalAmount = (ret.tonnages || 0) * (ret.ratePerTon || 0);
        } else if (!ret.totalAmount && ret.rateType === 'fixed_total') {
          ret.totalAmount = ret.ratePerTon || 0;
        }
        
        return ret;
      },
    },
  }
);

// Add pre-save middleware to compute/validate totalAmount
deliveryOrderSchema.pre('save', function(next) {
  if (this.rateType === 'per_ton') {
    this.totalAmount = (this.tonnages || 0) * (this.ratePerTon || 0);
  } else if (this.rateType === 'fixed_total') {
    this.totalAmount = this.ratePerTon || 0;
    // For fixed total, set tonnages to 0 or 1
    if (!this.tonnages) {
      this.tonnages = 0;
    }
  }
  next();
});
```

#### 3. Update Controller (`backend/src/controllers/deliveryOrderController.ts`)

**In createDeliveryOrder**:
```typescript
export const createDeliveryOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // If sn is not provided, derive it from doNumber
    if (!req.body.sn && req.body.doNumber) {
      req.body.sn = parseInt(req.body.doNumber.replace(/^0+/, '')) || 1;
    }
    
    // Set defaults for new fields if not provided
    if (!req.body.rateType) {
      req.body.rateType = 'per_ton';
    }
    if (!req.body.cargoType) {
      req.body.cargoType = req.body.containerNo?.toLowerCase().includes('container') 
        ? 'container' 
        : 'loosecargo';
    }
    
    // Calculate totalAmount if not provided
    if (!req.body.totalAmount) {
      if (req.body.rateType === 'per_ton') {
        req.body.totalAmount = (req.body.tonnages || 0) * (req.body.ratePerTon || 0);
      } else {
        req.body.totalAmount = req.body.ratePerTon || 0;
      }
    }
    
    const deliveryOrder = await DeliveryOrder.create(req.body);

    logger.info(`Delivery order created: ${deliveryOrder.doNumber} by ${req.user?.username}`);

    res.status(201).json({
      success: true,
      message: 'Delivery order created successfully',
      data: deliveryOrder,
    });
  } catch (error: any) {
    throw error;
  }
};
```

---

### Display & Reporting Changes

#### 1. Update DO Display Components

**DeliveryNotePrint.tsx** (and similar display components):
```tsx
{/* Display rate information based on type */}
{order.rateType === 'per_ton' ? (
  <>
    <div>Tonnage: {order.tonnages}</div>
    <div>Rate Per Ton: {order.ratePerTon}</div>
    <div>Total: {(order.tonnages * order.ratePerTon).toLocaleString()}</div>
  </>
) : (
  <div>Total Amount: {order.ratePerTon?.toLocaleString()}</div>
)}
```

#### 2. Update Summary/Workbook Components

**MonthlySummary.tsx**:
```typescript
// When calculating totals
const calculateTotal = (order: DeliveryOrder) => {
  if (order.rateType === 'fixed_total') {
    return order.ratePerTon || 0;
  }
  return (order.tonnages || 0) * (order.ratePerTon || 0);
};
```

---

## Migration Strategy

### For Existing Data

**Option 1: Default Values (Recommended)**
- Existing DOs without `rateType`: treat as `per_ton` (current behavior)
- Existing DOs without `cargoType`: derive from `containerNo` field
- No data migration script needed

**Option 2: Explicit Migration**
```javascript
// Migration script if needed
db.deliveryorders.updateMany(
  { rateType: { $exists: false } },
  { 
    $set: { 
      rateType: 'per_ton',
      totalAmount: { $multiply: ['$tonnages', '$ratePerTon'] }
    } 
  }
);

db.deliveryorders.updateMany(
  { cargoType: { $exists: false } },
  [
    {
      $set: {
        cargoType: {
          $cond: [
            { $regexMatch: { input: '$containerNo', regex: /container/i } },
            'container',
            'loosecargo'
          ]
        }
      }
    }
  ]
);
```

---

## Testing Checklist

### Frontend Testing
- [ ] Bulk creation with loose cargo + per-ton rate
- [ ] Bulk creation with container + per-ton rate
- [ ] Bulk creation with loose cargo + fixed total
- [ ] Bulk creation with container + fixed total
- [ ] Single DO creation with all combinations
- [ ] Edit existing DO (ensure backward compatibility)
- [ ] Preview table displays correct columns based on rate type
- [ ] PDF generation includes correct rate information

### Backend Testing
- [ ] Create DO with per-ton rate
- [ ] Create DO with fixed total rate
- [ ] Validate totalAmount calculation
- [ ] Update DO with rate type change
- [ ] Fetch DOs and verify computed fields
- [ ] Export to Excel includes correct calculations

### Data Validation
- [ ] Existing DOs display correctly (backward compatibility)
- [ ] New DOs with rateType save and retrieve properly
- [ ] Reports and summaries calculate totals correctly
- [ ] Fuel records generation works with both rate types

---

## User Guide

### For Per-Ton Rate (Existing Behavior)
1. Select **Cargo Type**: Loose Cargo or Container
2. Select **Rate Structure**: Per Ton Rate
3. Paste data format: `Truck | Trailer | Driver | Tonnage | Rate Per Ton`
4. System calculates: Total = Tonnage × Rate Per Ton

### For Fixed Total Rate (New)
1. Select **Cargo Type**: Loose Cargo or Container
2. Select **Rate Structure**: Fixed Total Amount
3. Paste data format: `Truck | Trailer | Driver | Total Amount`
4. System uses: Total = Fixed Amount (no weight calculation)

---

## Implementation Priority

### Phase 1: Core Changes (High Priority)
1. ✅ Add fields to backend model and types
2. ✅ Update BulkDOForm UI with cargo type and rate type selectors
3. ✅ Update parsing logic to handle both formats
4. ✅ Update DO generation logic
5. ✅ Test basic creation flow

### Phase 2: Display & Compatibility (Medium Priority)
6. ✅ Update DOForm for single DO creation
7. ✅ Update display components (DeliveryNotePrint, etc.)
8. ✅ Update summary/workbook calculations
9. ✅ Test backward compatibility with existing DOs

### Phase 3: Polish (Low Priority)
10. ✅ Update Excel export format
11. ✅ Add validation messages
12. ✅ User documentation
13. ✅ Migration script if needed

---

## Files to Modify

### Frontend Files
1. `/frontend/src/components/BulkDOForm.tsx` - Main bulk creation form
2. `/frontend/src/components/DOForm.tsx` - Single DO form
3. `/frontend/src/types/index.ts` - TypeScript types
4. `/frontend/src/components/DeliveryNotePrint.tsx` - Print/PDF display
5. `/frontend/src/components/MonthlySummary.tsx` - Summary calculations
6. `/frontend/src/components/DOWorkbook.tsx` - Workbook display

### Backend Files
1. `/backend/src/types/index.ts` - TypeScript interfaces
2. `/backend/src/models/DeliveryOrder.ts` - Mongoose schema
3. `/backend/src/controllers/deliveryOrderController.ts` - Controller logic

---

## Summary

This solution provides:
- ✅ **Flexible cargo type selection** (loose cargo vs container)
- ✅ **Two rate structures** (per-ton vs fixed total)
- ✅ **Backward compatibility** with existing DOs
- ✅ **Clean UI/UX** with conditional fields
- ✅ **Accurate calculations** for both scenarios
- ✅ **No breaking changes** to existing logic

The implementation uses existing fields cleverly (`ratePerTon` stores either rate or total based on `rateType`) to minimize database changes while adding new flexibility.
