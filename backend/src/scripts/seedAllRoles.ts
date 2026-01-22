import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import bcrypt from 'bcryptjs';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { User } from '../models';

const seedAllUsers = async () => {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || '');
    console.log('✅ Connected to MongoDB\n');

    // Define all users for each role
    const users = [
      // Super Admin
      {
        username: 'superadmin',
        email: 'superadmin@tahmeed.com',
        password: 'admin123',
        firstName: 'Super',
        lastName: 'Admin',
        role: 'super_admin',
        department: 'IT',
      },
      
      // Admin
      {
        username: 'admin',
        email: 'admin@tahmeed.com',
        password: 'admin123',
        firstName: 'System',
        lastName: 'Admin',
        role: 'admin',
        department: 'Administration',
      },
      
      // Super Manager
      {
        username: 'supermanager',
        email: 'supermanager@tahmeed.com',
        password: 'manager123',
        firstName: 'Super',
        lastName: 'Manager',
        role: 'super_manager',
        department: 'Operations',
      },
      
      // Managers
      {
        username: 'mgr_infinity',
        email: 'mgr.infinity@tahmeed.com',
        password: 'manager123',
        firstName: 'Infinity',
        lastName: 'Manager',
        role: 'manager',
        department: 'Operations',
        station: 'INFINITY',
      },
      {
        username: 'mgr_ndola',
        email: 'mgr.ndola@tahmeed.com',
        password: 'manager123',
        firstName: 'Ndola',
        lastName: 'Manager',
        role: 'manager',
        department: 'Operations',
        station: 'LAKE NDOLA',
      },
      
      // Supervisor
      {
        username: 'supervisor',
        email: 'supervisor@tahmeed.com',
        password: 'super123',
        firstName: 'John',
        lastName: 'Supervisor',
        role: 'supervisor',
        department: 'Operations',
      },
      
      // Clerk
      {
        username: 'clerk',
        email: 'clerk@tahmeed.com',
        password: 'clerk123',
        firstName: 'Jane',
        lastName: 'Clerk',
        role: 'clerk',
        department: 'Administration',
      },
      
      // Drivers
      {
        username: 'driver1',
        email: 'driver1@tahmeed.com',
        password: 'driver123',
        firstName: 'James',
        lastName: 'Driver',
        role: 'driver',
        department: 'Logistics',
      },
      {
        username: 'truck_driver',
        email: 'truck.driver@tahmeed.com',
        password: 'drive123',
        firstName: 'Robert',
        lastName: 'Trucker',
        role: 'driver',
        department: 'Logistics',
      },
      
      // Viewer
      {
        username: 'viewer',
        email: 'viewer@tahmeed.com',
        password: 'viewer123',
        firstName: 'View',
        lastName: 'Only',
        role: 'viewer',
        department: 'General',
      },
      
      // Fuel Order Maker
      {
        username: 'fuelorder',
        email: 'fuelorder@tahmeed.com',
        password: 'fuel123',
        firstName: 'Fuel',
        lastName: 'OrderMaker',
        role: 'fuel_order_maker',
        department: 'Operations',
      },
      
      // Boss
      {
        username: 'boss',
        email: 'boss@tahmeed.com',
        password: 'boss123',
        firstName: 'Big',
        lastName: 'Boss',
        role: 'boss',
        department: 'Management',
      },
      
      // Yard Personnel
      {
        username: 'yardman',
        email: 'yardman@tahmeed.com',
        password: 'yard123',
        firstName: 'Yard',
        lastName: 'Personnel',
        role: 'yard_personnel',
        department: 'Yard Operations',
        yard: 'DAR YARD',
      },
      
      // Fuel Attendant
      {
        username: 'attendant',
        email: 'attendant@tahmeed.com',
        password: 'fuel123',
        firstName: 'Fuel',
        lastName: 'Attendant',
        role: 'fuel_attendant',
        department: 'Fuel Station',
      },
      
      // Station Manager
      {
        username: 'stationmgr',
        email: 'stationmgr@tahmeed.com',
        password: 'station123',
        firstName: 'Station',
        lastName: 'Manager',
        role: 'station_manager',
        department: 'Fuel Station',
        station: 'INFINITY',
      },
      
      // Payment Manager
      {
        username: 'paymentmgr',
        email: 'paymentmgr@tahmeed.com',
        password: 'payment123',
        firstName: 'Payment',
        lastName: 'Manager',
        role: 'payment_manager',
        department: 'Finance',
      },
      
      // Yard roles
      {
        username: 'dar_yard',
        email: 'dar.yard@tahmeed.com',
        password: 'yard123',
        firstName: 'DAR',
        lastName: 'Yard',
        role: 'dar_yard',
        department: 'Yard Operations',
        yard: 'DAR YARD',
      },
      {
        username: 'tanga_yard',
        email: 'tanga.yard@tahmeed.com',
        password: 'yard123',
        firstName: 'TANGA',
        lastName: 'Yard',
        role: 'tanga_yard',
        department: 'Yard Operations',
        yard: 'TANGA YARD',
      },
      {
        username: 'mmsa_yard',
        email: 'mmsa.yard@tahmeed.com',
        password: 'yard123',
        firstName: 'MMSA',
        lastName: 'Yard',
        role: 'mmsa_yard',
        department: 'Yard Operations',
        yard: 'MMSA YARD',
      },
      
      // Import/Export Officers
      {
        username: 'import_officer',
        email: 'import.officer@tahmeed.com',
        password: 'import123',
        firstName: 'Import',
        lastName: 'Officer',
        role: 'import_officer',
        department: 'Logistics',
      },
      {
        username: 'export_officer',
        email: 'export.officer@tahmeed.com',
        password: 'export123',
        firstName: 'Export',
        lastName: 'Officer',
        role: 'export_officer',
        department: 'Logistics',
      },
    ];

    console.log(`📝 Preparing to seed ${users.length} users...\n`);

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const userData of users) {
      try {
        const existingUser = await User.findOne({ username: userData.username });
        
        if (existingUser) {
          // Update existing user
          const hashedPassword = await bcrypt.hash(userData.password, 10);
          await User.findByIdAndUpdate(existingUser._id, {
            ...userData,
            password: hashedPassword,
          });
          console.log(`✏️  Updated: ${userData.username} (${userData.role})`);
          updated++;
        } else {
          // Create new user
          const hashedPassword = await bcrypt.hash(userData.password, 10);
          await User.create({
            ...userData,
            password: hashedPassword,
          });
          console.log(`✅ Created: ${userData.username} (${userData.role})`);
          created++;
        }
      } catch (error: any) {
        console.log(`❌ Error with ${userData.username}: ${error.message}`);
        skipped++;
      }
    }

    console.log('\n📊 Seeding Summary:');
    console.log(`   ✅ Created: ${created}`);
    console.log(`   ✏️  Updated: ${updated}`);
    console.log(`   ❌ Skipped: ${skipped}`);
    console.log(`   📈 Total:   ${users.length}\n`);

    // Display role distribution
    console.log('👥 Role Distribution:');
    const roleStats = await User.aggregate([
      { $group: { _id: '$role', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
    
    roleStats.forEach(stat => {
      console.log(`   - ${stat._id}: ${stat.count}`);
    });

    console.log('\n✨ All users have been seeded successfully!\n');

    await mongoose.connection.close();
    console.log('👋 Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error seeding users:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
};

seedAllUsers();
