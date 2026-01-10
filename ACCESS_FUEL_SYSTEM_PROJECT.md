# TAHMEED TRANSPORTERS FUEL MANAGEMENT SYSTEM
## Microsoft Access Database Project Documentation

### PROJECT OVERVIEW
A comprehensive fuel management system for Tahmeed Transporters to manage fuel orders, truck operations, LPO generation, and fuel tracking across multiple checkpoints and destinations.

---

## SYSTEM ARCHITECTURE

### DATABASE STRUCTURE

#### Core Tables
1. **tbl_Trucks** - Truck fleet management
2. **tbl_Stations** - Fuel stations and suppliers
3. **tbl_Routes** - Transportation routes
4. **tbl_Users** - System users and authentication
5. **tbl_FuelRecords** - Main fuel consumption tracking
6. **tbl_LPO** - Local Purchase Orders
7. **tbl_LPODetails** - LPO line items
8. **tbl_LPOSummary** - LPO reporting summaries
9. **tbl_FormPermissions** - Role-based access control

#### Key Relationships
- Trucks → FuelRecords (One-to-Many)
- Routes → FuelRecords (One-to-Many)  
- Stations → LPO (One-to-Many)
- LPO → LPODetails (One-to-Many)
- FuelRecords → LPODetails (One-to-Many)

---

## USER ROLES & PERMISSIONS

### 1. ADMIN ROLE
**Full System Access**
- ✅ User Management (Create, Edit, Delete users)
- ✅ Truck Management (Add/Edit trucks, batches, configurations)
- ✅ Station Management (Add/Edit fuel stations and rates)
- ✅ Route Management (Define and modify routes)
- ✅ Fuel Records (View, Edit, Delete all records)
- ✅ LPO Management (Create, Edit, Delete, Send LPOs)
- ✅ System Reports (All reports and analytics)
- ✅ Database Backup and Maintenance
- ✅ System Configuration
- ✅ Form Permissions Management

### 2. FUEL ORDER MAKER ROLE
**Operational Fuel Management**
- ✅ Fuel Records Entry (Create and edit fuel consumption records)
- ✅ LPO Creation (Generate Local Purchase Orders)
- ✅ LPO Management (Edit draft LPOs, mark as sent)
- ✅ View Trucks (Read-only access to truck information)
- ✅ View Stations (Read-only access to station information)
- ✅ View Routes (Read-only access to route information)
- ✅ Operational Reports (Fuel consumption, LPO reports)
- ❌ User Management (Cannot modify users)
- ❌ Master Data Changes (Cannot modify trucks/stations/routes)
- ❌ System Administration

---

## CORE FUNCTIONALITIES

### FUEL TRACKING SYSTEM
**Checkpoint-Based Fuel Management**
- **Yard Entries**: MMSA Yard, Tanga Yard, Dar Yard
- **Going Checkpoints**: Dar, Morogoro, Mbeya, Tunduma, Zambia, Congo
- **Return Checkpoints**: Zambia, Tunduma, Mbeya, Morogoro, Dar, Tanga
- **Balance Calculation**: Automatic fuel balance computation
- **Multi-Route Support**: DAR-LUBUMBASHI, DAR-LIKASI, etc.

### LPO GENERATION SYSTEM
**Automated Purchase Order Creation**
- **Smart LPO Numbers**: Auto-generated (LPO25-0001 format)
- **Station Integration**: Link to fuel stations and current rates
- **Multi-Line Items**: Support for multiple fuel entries per LPO
- **Status Tracking**: Draft → Sent → Completed
- **Total Calculations**: Automatic amount and liter totals

### TRUCK BATCH SYSTEM
**Flexible Fuel Allocation**
- **Batch Types**: 100L, 80L, 60L standard batches
- **Extra Fuel**: Additional fuel allowances per truck
- **Dynamic Batching**: Configurable fuel amounts per route
- **Truck Status**: Active/Inactive truck management

---

## FORMS STRUCTURE

### ADMIN FORMS
1. **frm_AdminDashboard** - Main admin control panel
2. **frm_UserManagement** - User CRUD operations
3. **frm_TruckManagement** - Truck fleet management
4. **frm_StationManagement** - Fuel station configuration
5. **frm_RouteManagement** - Route definitions
6. **frm_SystemSettings** - System configuration
7. **frm_DatabaseMaintenance** - Backup and maintenance tools

### FUEL ORDER MAKER FORMS
1. **frm_FuelOrderDashboard** - Operational dashboard
2. **frm_FuelRecordEntry** - Fuel consumption data entry
3. **frm_LPOCreation** - LPO generation wizard
4. **frm_LPOManagement** - LPO editing and tracking
5. **frm_FuelReports** - Operational reporting

### SHARED FORMS
1. **frm_Login** - System authentication
2. **frm_PasswordChange** - Password modification
3. **frm_ViewTrucks** - Read-only truck information
4. **frm_ViewStations** - Read-only station information
5. **frm_ViewRoutes** - Read-only route information

---

## REPORTS STRUCTURE

### OPERATIONAL REPORTS (Both Roles)
- **Fuel Consumption Summary** - By truck, route, date range
- **LPO Reports** - Individual and summary LPO printing
- **Station-wise Fuel Orders** - Grouped by fuel station
- **Route Performance** - Fuel efficiency by route
- **Daily/Weekly/Monthly Summaries**

### ADMINISTRATIVE REPORTS (Admin Only)
- **System Usage Reports** - User activity tracking
- **Data Integrity Reports** - Database consistency checks
- **Master Data Reports** - Trucks, stations, routes summaries
- **Financial Reports** - Cost analysis and budgeting

---

## SECURITY FEATURES

### AUTHENTICATION & AUTHORIZATION
- **Secure Login System** - Username/password authentication
- **Role-Based Access Control** - Form and feature permissions
- **Session Management** - Login tracking and timeout
- **Password Encryption** - Basic password encoding
- **User Activity Logging** - Track user actions

### DATA PROTECTION
- **Field Validation** - Data type and range validation
- **Referential Integrity** - Foreign key constraints
- **Audit Trail** - Created/Modified tracking
- **Backup Integration** - Database backup functionality

---

## TECHNICAL SPECIFICATIONS

### VBA MODULES
1. **mod_Authentication** - Login and security functions
2. **mod_FuelCalculations** - Business logic calculations
3. **mod_LPOManagement** - LPO generation and management
4. **mod_DataValidation** - Input validation routines
5. **mod_Utilities** - Common utility functions
6. **mod_Reports** - Report generation helpers

### QUERIES
- **qry_ActiveTrucks** - Active truck list
- **qry_ActiveStations** - Active station list  
- **qry_ActiveRoutes** - Active route list
- **qry_FuelRecordsWithDetails** - Comprehensive fuel data
- **qry_LPOWithDetails** - LPO with station information
- **qry_UserPermissions** - Role-based access queries

---

## IMPLEMENTATION PHASES

### Phase 1: Core Structure (Week 1)
- [ ] Database tables creation
- [ ] Basic relationships
- [ ] Sample data insertion
- [ ] Core VBA modules

### Phase 2: Authentication System (Week 2)
- [ ] User management
- [ ] Login system
- [ ] Role-based permissions
- [ ] Security implementation

### Phase 3: Fuel Management (Week 3)
- [ ] Fuel record entry forms
- [ ] Calculation engine
- [ ] Validation rules
- [ ] Basic reporting

### Phase 4: LPO System (Week 4)
- [ ] LPO creation forms
- [ ] Auto-generation logic
- [ ] LPO management
- [ ] LPO reporting

### Phase 5: Advanced Features (Week 5)
- [ ] Advanced reporting
- [ ] System administration
- [ ] Data export/import
- [ ] Performance optimization

---

## SUCCESS CRITERIA

### Functional Requirements
- ✅ Two-role system (Admin + Fuel Order Maker)
- ✅ Complete fuel tracking from source to destination
- ✅ Automated LPO generation with proper numbering
- ✅ Real-time fuel balance calculations
- ✅ Comprehensive reporting system

### Technical Requirements
- ✅ Microsoft Access 2016+ compatibility
- ✅ Single-file deployment (.accdb)
- ✅ Role-based security implementation
- ✅ Data validation and integrity
- ✅ Backup and recovery procedures

### Performance Requirements
- ⚡ Sub-second form loading times
- ⚡ Efficient query performance
- ⚡ Minimal network dependencies
- ⚡ Scalable to 1000+ fuel records

---

## NEXT STEPS

1. **Review and Approve** this project structure
2. **Customize Requirements** based on specific needs
3. **Execute VBA Builder** to create the database
4. **Test Core Functionality** with sample data
5. **Design Custom Forms** for optimal user experience
6. **Implement Security** and role-based access
7. **User Training** and system deployment

---

*This document serves as the blueprint for the Tahmeed Transporters Fuel Management System. All development should align with these specifications to ensure successful project delivery.*