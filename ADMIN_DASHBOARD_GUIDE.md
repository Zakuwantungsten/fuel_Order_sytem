# Admin Dashboard Guide

## Overview

The Admin Dashboard provides administrative functionality for managing the Fuel Order Management System. It allows administrators to configure system settings, manage users, and monitor system statistics.

## Access

The Admin Dashboard is accessible to users with the following roles:
- `super_admin` - Full access to all admin features
- `admin` - Administrative access
- `boss` - Executive access with admin capabilities

To access the Admin Dashboard:
1. Log in with an admin account
2. Navigate to "Admin Settings" in the sidebar menu

## Features

### 1. Overview Tab

Displays system-wide statistics:
- **User Statistics**: Total, active, and inactive user counts
- **Record Counts**: Delivery Orders, LPOs, Fuel Records, Yard Dispenses
- **Role Distribution**: Breakdown of users by role
- **Recent Users**: List of recently created user accounts

### 2. Fuel Stations Tab

Manage fuel station configurations and rates:

#### View Stations
- See all configured fuel stations
- View current price per liter
- Check station status (Active/Inactive)

#### Update Station Rates
1. Click the Edit (pencil) icon on any station
2. Enter the new price per liter
3. Click Save to confirm

#### Add New Station
1. Click "Add Station" button
2. Fill in the required fields:
   - **Station ID**: Unique identifier (e.g., `new_station`)
   - **Station Name**: Display name (e.g., `NEW STATION`)
   - **Location**: Geographic location
   - **Price per Liter**: Current fuel rate
3. Click Save

#### Toggle Station Status
- Click the status toggle icon to activate/deactivate a station
- Inactive stations will not appear in LPO creation forms

### 3. Routes Tab

Manage total liter allocations for different destinations:

#### View Routes
- See all configured routes with their liter allocations
- Routes are color-coded by status (Active/Inactive)

#### Update Route Allocation
1. Click the Edit icon on the route card
2. Enter the new total liters
3. Click Save

#### Add New Route
1. Click "Add Route" button
2. Enter destination name (will be converted to uppercase)
3. Enter total liters allocation
4. Click Save

#### Delete Route
- Click the Delete (trash) icon to remove a route
- Confirm deletion when prompted

### 4. Truck Batches Tab

Manage truck extra fuel allocations by batch:

#### Understanding Batches
- **100L Batch**: Trucks that receive 100 liters extra fuel
- **80L Batch**: Trucks that receive 80 liters extra fuel
- **60L Batch**: Trucks that receive 60 liters extra fuel (default)

#### Add Truck to Batch
1. Click "Add Truck" button
2. Enter the truck suffix (last 3 letters of truck number)
3. Optionally enter the full truck number
4. Select the batch (60L, 80L, or 100L)
5. Click Save

#### Remove Truck from Batch
- Click the X button next to any truck to remove it
- The truck will return to the default 60L allocation

#### Batch Logic
When calculating fuel records, the system checks the truck number suffix:
- If suffix is in batch_100, truck gets 100L extra
- If suffix is in batch_80, truck gets 80L extra
- Otherwise, truck gets 60L extra (default)

### 5. Allocations Tab

Manage standard fuel allocations for different checkpoints:

#### Available Allocations
| Allocation | Description | Default |
|------------|-------------|---------|
| Tanga Yard to DAR | From Tanga Yard to Dar es Salaam | 100L |
| DAR Yard Standard | Standard DAR Yard allocation | 550L |
| DAR Yard Kisarawe | Kisarawe route allocation | 580L |
| Mbeya Going | Going to Mbeya | 450L |
| Tunduma Return | Return from Tunduma | 100L |
| Mbeya Return | Return from Mbeya | 400L |
| Moro Return to Mombasa | Moro to Mombasa | 100L |
| Tanga Return to Mombasa | Tanga to Mombasa | 70L |

#### Update Allocations
1. Click "Edit" button
2. Modify the desired allocation values
3. Click "Save" to apply changes
4. Click "Cancel" to discard changes

### 6. Users Tab

Manage system users:

#### Search & Filter
- Use the search box to find users by name, email, or username
- Use the role filter dropdown to filter by role

#### Create New User
1. Click "Create User" button
2. Fill in the required fields:
   - First Name, Last Name
   - Username, Email, Password
   - Role selection
   - Department (optional)
   - Station (optional)
   - Truck Number (for drivers)
3. Click "Create User"

#### Batch Create Driver Accounts
1. Click "Batch Create Drivers" button
2. Enter truck numbers (one per line or comma-separated)
3. Click "Create Driver Accounts"
4. Accounts will be created with:
   - Username: `driver_<suffix>`
   - Default password: `driver123`
   - Role: `driver`

#### User Actions
- **Toggle Status**: Activate or deactivate a user account
- **Reset Password**: Generate a new temporary password

## API Endpoints

### Admin Stats
```
GET /api/admin/stats
```

### Fuel Stations
```
GET    /api/admin/fuel-stations
POST   /api/admin/fuel-stations
PUT    /api/admin/fuel-stations/:stationId
PUT    /api/admin/fuel-stations/bulk-update/rates
```

### Routes
```
GET    /api/admin/routes
POST   /api/admin/routes
PUT    /api/admin/routes/:destination
DELETE /api/admin/routes/:destination
```

### Truck Batches
```
GET    /api/admin/truck-batches
POST   /api/admin/truck-batches
DELETE /api/admin/truck-batches/:truckSuffix
```

### Standard Allocations
```
GET    /api/admin/standard-allocations
PUT    /api/admin/standard-allocations
```

### Combined Configuration
```
GET    /api/admin/config
POST   /api/admin/config/reset/:configType
```

## Configuration Sync

The system supports syncing configuration between the backend database and frontend localStorage:

- Configuration is automatically synced on first load
- Manual sync can be triggered by refreshing the page
- Changes made in the Admin Dashboard are immediately saved to the backend

## Best Practices

1. **Rate Updates**: When updating station rates, verify the new rates are correct before saving
2. **Route Management**: Use uppercase destination names for consistency
3. **Truck Batches**: Always use the truck suffix (last 3 characters) for batch assignment
4. **User Management**: Use batch creation for multiple drivers to save time
5. **Password Security**: Encourage users to change their temporary passwords after first login

## Troubleshooting

### Configuration Not Loading
1. Check backend server is running
2. Verify network connectivity
3. Check browser console for errors
4. Try refreshing the page

### Changes Not Saving
1. Verify you have admin privileges
2. Check for validation errors
3. Ensure the backend server is accessible
4. Check the browser console for API errors

### User Creation Failed
1. Verify username is unique
2. Verify email is unique
3. Ensure password meets minimum requirements (6 characters)
4. Check for validation errors in the form
