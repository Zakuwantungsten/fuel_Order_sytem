# LPO Excel-like Workbook System Implementation

## Overview

The new LPO system has been designed to replicate the traditional Excel workbook approach where:
- Each workbook represents a collection of LPOs (like an Excel file)
- Each LPO is a separate sheet within the workbook (like Excel sheets/tabs)
- Each sheet has the traditional LPO format with header info and detailed entries

## Key Components

### 1. **LPOWorkbook Component** (`/components/LPOWorkbook.tsx`)
- Main workbook interface with Excel-like tabs at the bottom
- Workbook header with name, save, export functionality
- Sheet management (add, rename, duplicate, delete)
- Auto-generation of sequential LPO numbers

### 2. **LPOSheetView Component** (`/components/LPOSheetView.tsx`)
- Individual sheet display with traditional LPO format
- Excel-like table with inline editing capabilities
- Header information (LPO No., Date, Station, Order of)
- Entry management with real-time calculation
- Summary statistics and totals

### 3. **Enhanced Type Definitions** (`/types/index.ts`)
```typescript
// New types added:
- LPOWorkbook: Represents the entire workbook
- LPOSheet: Represents individual LPO sheet
- Enhanced LPODetail: Entry rows with sorting
```

### 4. **Workbook API** (`/services/api.ts`)
```typescript
// New API endpoints:
- lpoWorkbookAPI.getAll()
- lpoWorkbookAPI.create()
- lpoWorkbookAPI.addSheet()
- lpoWorkbookAPI.updateSheet()
- lpoWorkbookAPI.deleteSheet()
```

## Features Implemented

### Traditional Excel Structure
- **Workbook Level**: Multiple LPO documents in one file
- **Sheet Level**: Individual LPO with unique number
- **Tab Navigation**: Click between LPO sheets
- **Sequential Numbering**: Auto-increment LPO numbers

### Excel-like Functionality
- **Rename Sheets**: Double-click or edit button on tabs
- **Add Sheets**: Plus button creates new LPO sheet
- **Delete Sheets**: Remove individual LPO sheets
- **Duplicate Sheets**: Copy existing LPO with new number
- **Save Workbook**: Persistent storage of all changes
- **Export Workbook**: CSV export of all sheets

### Traditional LPO Format
```
LPO No. 2360                    Date: 17.11.2025
Station: CASH                   Order of: TAHMEED

KINDLY SUPPLY THE FOLLOWING LITERS

+----------+----------+--------+--------+---------+------+
| DO No.   | Truck No.| Liters | Rate   | Amount  | Dest.|
+----------+----------+--------+--------+---------+------+
| NIL      | T762 DWK | 50     | 2940.6 | 147030  | NIL  |
| NIL      | T667 EAQ | 50     | 2940.6 | 147030  | NIL  |
|          |          | TOTAL  |        | 294060  |      |
+----------+----------+--------+--------+---------+------+
```

### User Interface
- **Two View Modes**: List view (traditional) and Workbook view (Excel-like)
- **Toggle Between Views**: Button in the header
- **Workbook Gallery**: Grid of available workbooks
- **Real-time Calculations**: Automatic amount calculation (liters × rate)
- **Inline Editing**: Click to edit entries directly in the table

## Usage Instructions

### Creating a New Workbook
1. Go to LPOs page
2. Switch to "Workbook View"
3. Click "New Workbook" button
4. Workbook opens with ability to add first sheet

### Adding LPO Sheets
1. Open a workbook
2. Click "Add Sheet" button in tab bar
3. New sheet created with auto-incremented LPO number
4. Fill in header information and entries

### Managing Entries
1. In sheet view, use the green row at bottom to add entries
2. Enter Truck No., Liters, Rate, Destination
3. Amount calculates automatically
4. Click "+" to add entry
5. Edit existing entries with edit button
6. Delete entries with trash button

### Sheet Management
1. **Rename**: Click edit icon on active tab or double-click tab name
2. **Duplicate**: Click copy icon to create copy with new LPO number
3. **Delete**: Click trash icon (must have at least one sheet)

### Saving and Exporting
1. **Save**: Click save button in workbook header
2. **Export**: Click export button for CSV download of all sheets
3. **Auto-save**: Changes saved when switching sheets or closing

## Traditional Excel Workflow Replicated

This system perfectly replicates the traditional workflow:

1. **Create Workbook** = Create new Excel file
2. **Add Sheets** = Add new Excel sheets/tabs
3. **Name Sheets by LPO Number** = Sheet names match LPO numbers
4. **Fill LPO Data** = Traditional LPO format maintained
5. **Sequential Numbering** = Auto-increment like Excel formulas
6. **Save File** = Persistent workbook storage
7. **Export** = Excel-like export functionality

## Benefits

- **Familiar Interface**: Mirrors Excel experience users know
- **Better Organization**: Multiple LPOs in organized workbooks
- **Sequential Management**: Auto-numbering prevents duplicates
- **Traditional Format**: Maintains existing LPO document structure
- **Dual View**: Can still use list view for quick overview
- **Real-time Calculations**: Automatic totals and amounts
- **Export Compatibility**: CSV export for Excel import

The system successfully bridges traditional Excel workflows with modern web application benefits while maintaining the familiar structure and process users are accustomed to.