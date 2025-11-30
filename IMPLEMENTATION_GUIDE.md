# Fuel Order Management System - Frontend Implementation

## Overview
This document details the frontend implementation for the Fuel Order Management System, focusing on Fuel Records and Local Purchase Orders (LPOs) functionality based on the provided CSV data structures.

## What Was Built

### 1. Type Definitions (`src/types/index.ts`)
Updated type definitions to match the exact CSV structures:

#### Fuel Record Type
Matches `FUEL RECORD.csv` with all fields:
- Date, Truck No., Going DO, Return DO
- Start, From, To, Total Lts, Extra
- Yard allocations: MMSA Yard, Tanga Yard, Dar Yard
- Going fuel: Dar Going, Moro Going, Mbeya Going, Tdm Going, Zambia Going, Congo Fuel
- Return fuel: Zambia Return, Tunduma Return, Mbeya Return, Moro Return, Dar Return, Tanga Return
- Balance

#### LPO Entry Type
Matches `SUMMARY LPOS.csv`:
- S/No, Date, LPO No., Diesel @ (Station)
- DO/SDO, Truck No., Ltrs, Price per Ltr, Destinations

#### LPO Summary Type
Matches `LPOS 2025.csv` (detailed LPO format):
- Header: LPO No., Date, Station, Order Of
- Entries array with: DO No., Truck No., Liters, Rate, Amount, Dest.
- Total amount

### 2. Components Created

#### `FuelRecordForm.tsx`
- Comprehensive form with all 24+ fields from CSV
- Organized into logical sections:
  - Basic Information (Date, Truck, DOs, Route)
  - Yard Allocations
  - Going Fuel Allocations
  - Return Fuel Allocations
  - Balance
- Form validation
- Create/Edit modes
- Auto-calculation support

#### `LPOForm.tsx`
- Form for creating/editing individual LPO entries (Summary LPOS format)
- Fields: S/No, Date, LPO No., Station, DO/SDO, Truck No., Liters, Price/Ltr, Destinations
- Dropdown selectors for stations and destinations
- Real-time amount calculation display
- Clean, user-friendly interface

#### `LPODetailForm.tsx`
- Advanced form for creating complete LPO documents
- Header section with LPO metadata
- Dynamic table for adding multiple fuel supply entries
- Features:
  - Add/remove entries dynamically
  - Auto-calculate amounts (Liters × Rate)
  - Real-time total calculation
  - Inline editing in table format
- Matches the detailed LPO format from CSV

#### `LPOPrint.tsx`
- Print-friendly component for LPO documents
- Professional layout matching official LPO format
- Features:
  - Header with LPO No. and Date
  - Station and Order information
  - Detailed table with all entries
  - Total calculation
  - Signature sections (Prepared By, Approved By, Received By)
  - Print-optimized CSS
  - A4 page formatting

### 3. Pages Updated

#### `FuelRecords.tsx`
Enhanced with full CRUD functionality:
- **Display**: Table showing all fuel records with key fields
- **Search & Filter**: 
  - Search by Truck No., Going DO, Return DO
  - Filter by route (destination)
  - Filter by date
- **Actions**:
  - Create new records
  - Edit existing records
  - Delete records (with confirmation)
  - Export to CSV with all fields
- **Statistics**: Total records count
- **Integration**: Uses FuelRecordForm component

#### `LPOs.tsx`
Enhanced with dual functionality:
- **Display**: Table showing LPO entries with calculated amounts
- **Summary Cards**: 
  - Total entries count
  - Total liters
  - Total amount in TZS
- **Search & Filter**:
  - Search by LPO No., Truck No., DO/SDO
  - Filter by station
  - Filter by date
  - Clear filters button
- **Actions**:
  - Create new LPO entry (Summary format)
  - Create new LPO document (Detailed format)
  - Edit entries
  - Delete entries (with confirmation)
  - Export to CSV
- **Integration**: Uses both LPOForm and LPODetailForm

### 4. API Service (`src/services/api.ts`)

#### Added APIs:
1. **lposAPI** - For LPO entries (Summary LPOS)
   - getAll, getById, create, update, delete
   
2. **lpoDocumentsAPI** - For LPO documents (Detailed format)
   - getAll, getById, getByLpoNo, create, update, delete

3. **fuelRecordsAPI** - Already existed, maintained structure

## Features Implemented

### Data Management
✅ Full CRUD operations for Fuel Records
✅ Full CRUD operations for LPOs (both formats)
✅ Proper data validation
✅ Error handling with user feedback

### User Interface
✅ Responsive design (mobile-friendly)
✅ Clean, professional layout
✅ Intuitive forms with logical grouping
✅ Real-time calculations
✅ Loading states
✅ Empty states

### Search & Filtering
✅ Text search across multiple fields
✅ Dropdown filters (station, route)
✅ Date filtering
✅ Filter clearing

### Export & Print
✅ CSV export with all fields
✅ Print-ready LPO documents
✅ Proper formatting for official use

### Data Integrity
✅ Maintains original CSV field structure
✅ Proper data types (numbers, dates, strings)
✅ Required field validation
✅ Auto-calculation where appropriate

## CSV Field Mappings

### Fuel Record CSV → Application
```
Date → date
Truck No. → truckNo
Going Do → goingDo
Return Do → returnDo
Start → start
From → from
To → to
Total Lts → totalLts
Extra → extra
MMSA Yard → mmsaYard
Tanga Yard → tangaYard
Dar Yard → darYard
Dar Going → darGoing
Moro Going → moroGoing
Mbeya Going → mbeyaGoing
Tdm Going → tdmGoing
Zambia Going → zambiaGoing
Congo Fuel → congoFuel
Zambia Return → zambiaReturn
Tunduma Return → tundumaReturn
Mbeya Return → mbeyaReturn
Moro Return → moroReturn
Dar Return → darReturn
Tanga Return → tangaReturn
Balance → balance
```

### LPO Summary CSV → Application
```
S/No. → sn
Date → date
LPO No. → lpoNo
Diesel @ → dieselAt
DO/SDO → doSdo
Truck No. → truckNo
Ltrs → ltrs
Price per Ltr → pricePerLtr
Destinations → destinations
```

### LPO Detail CSV → Application
```
LPO No. → lpoNo
Date → date
Station → station
Order of → orderOf
Do No. → doNo
Truck No. → truckNo
Liters → liters
Rate → rate
Amount → amount (calculated)
Dest. → dest
TOTAL → total (calculated)
```

## Station Options
Based on CSV data, supported stations:
- LAKE CHILABOMBWE
- LAKE NDOLA
- LAKE KAPIRI
- CASH
- TCC
- ZHANFEI
- KAMOA
- COMIKA

## Route/Destination Options
Based on CSV data:
- DAR (Dar es Salaam)
- MSA (Mwanza/Moshi)
- Kpm (Kapiri Mposhi)
- Likasi
- Kolwezi
- COMIKA
- ZHANFEI
- TCC
- NIL (for no destination)

## Backend Requirements

To use this frontend, your backend should implement these endpoints:

### Fuel Records
- `GET /api/fuel-records` - Get all records (with optional filters)
- `GET /api/fuel-records/:id` - Get single record
- `POST /api/fuel-records` - Create new record
- `PUT /api/fuel-records/:id` - Update record
- `DELETE /api/fuel-records/:id` - Delete record

### LPO Entries
- `GET /api/lpos` - Get all LPO entries
- `GET /api/lpos/:id` - Get single LPO entry
- `POST /api/lpos` - Create new LPO entry
- `PUT /api/lpos/:id` - Update LPO entry
- `DELETE /api/lpos/:id` - Delete LPO entry

### LPO Documents
- `GET /api/lpo-documents` - Get all LPO documents
- `GET /api/lpo-documents/:id` - Get single LPO document
- `GET /api/lpo-documents/lpo/:lpoNo` - Get by LPO number
- `POST /api/lpo-documents` - Create new LPO document
- `PUT /api/lpo-documents/:id` - Update LPO document
- `DELETE /api/lpo-documents/:id` - Delete LPO document

## Usage Instructions

### Adding a Fuel Record
1. Navigate to "Fuel Records" page
2. Click "New Record" button
3. Fill in all required fields (marked with *)
4. Enter yard allocations as negative values (fuel out)
5. Enter going/return fuel as needed
6. System will track balance
7. Click "Create Record"

### Adding an LPO Entry
1. Navigate to "LPOs" page
2. Click "New LPO Entry" button
3. Fill in entry details
4. Amount is calculated automatically (Liters × Price)
5. Click "Create LPO Entry"

### Creating an LPO Document
1. Navigate to "LPOs" page
2. Click "New LPO Document" button
3. Fill in header information (LPO No., Date, Station, Order Of)
4. Click "Add Entry" to add fuel supply lines
5. Fill in DO No., Truck No., Liters, Rate, Destination
6. Amount is auto-calculated for each entry
7. Total is auto-calculated
8. Click "Create LPO Document"

### Exporting Data
1. Apply any filters needed
2. Click "Export" button
3. CSV file will download with filtered data

### Searching & Filtering
- Use search box for quick text search
- Use dropdown filters for specific stations/routes
- Use date picker for date filtering
- Click "Clear Filters" to reset

## File Structure
```
frontend/src/
├── components/
│   ├── FuelRecordForm.tsx      # Fuel record form component
│   ├── LPOForm.tsx              # LPO entry form component
│   ├── LPODetailForm.tsx        # LPO document form component
│   └── LPOPrint.tsx             # Print-friendly LPO component
├── pages/
│   ├── FuelRecords.tsx          # Fuel records page with CRUD
│   └── LPOs.tsx                 # LPOs page with CRUD
├── services/
│   └── api.ts                   # API service with all endpoints
└── types/
    └── index.ts                 # TypeScript type definitions
```

## Next Steps

To complete the implementation:

1. **Backend Development**
   - Implement the API endpoints listed above
   - Add database models matching the types
   - Implement validation and business logic

2. **Data Import**
   - Create CSV import functionality
   - Bulk upload from existing CSV files
   - Data migration scripts

3. **Enhancements** (from refinement.md)
   - Add print functionality for individual fuel records
   - Implement batch operations
   - Add monthly summaries and reports
   - Create dashboard with statistics
   - Add user authentication and authorization

4. **Testing**
   - Test all CRUD operations
   - Test filters and search
   - Test CSV export
   - Test print functionality
   - Cross-browser testing

## Notes

- All numeric fields support decimals where appropriate
- Date fields use ISO format (YYYY-MM-DD) internally
- Negative values in yard allocations indicate fuel going out
- Balance is calculated based on fuel in/out
- LPO amounts are in TZS (Tanzanian Shillings)
- Print component is optimized for A4 paper

## Support

For issues or questions:
1. Check TypeScript errors in the IDE
2. Review console logs for API errors
3. Verify backend endpoints are running
4. Check network tab for failed requests

---

**Built with**: React, TypeScript, TailwindCSS, Lucide Icons
**Date**: November 2025
