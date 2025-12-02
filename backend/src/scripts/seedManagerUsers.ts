import mongoose from 'mongoose';
import { User } from '../models';
import { config } from '../config';
import logger from '../utils/logger';

// Station Manager Users - Each manager manages a specific station
const stationManagers = [
  // LAKE Stations (Zambia)
  {
    username: 'mgr_chilabombwe',
    password: 'Chilabombwe@2025',
    email: 'manager.chilabombwe@fuelorder.com',
    firstName: 'Chilabombwe',
    lastName: 'Manager',
    role: 'station_manager',
    station: 'LAKE CHILABOMBWE',
    department: 'Station Management',
    isActive: true,
  },
  {
    username: 'mgr_ndola',
    password: 'Ndola@2025',
    email: 'manager.ndola@fuelorder.com',
    firstName: 'Ndola',
    lastName: 'Manager',
    role: 'station_manager',
    station: 'LAKE NDOLA',
    department: 'Station Management',
    isActive: true,
  },
  {
    username: 'mgr_kapiri',
    password: 'Kapiri@2025',
    email: 'manager.kapiri@fuelorder.com',
    firstName: 'Kapiri',
    lastName: 'Manager',
    role: 'station_manager',
    station: 'LAKE KAPIRI',
    department: 'Station Management',
    isActive: true,
  },
  {
    username: 'mgr_kitwe',
    password: 'Kitwe@2025',
    email: 'manager.kitwe@fuelorder.com',
    firstName: 'Kitwe',
    lastName: 'Manager',
    role: 'station_manager',
    station: 'LAKE KITWE',
    department: 'Station Management',
    isActive: true,
  },
  {
    username: 'mgr_kabangwa',
    password: 'Kabangwa@2025',
    email: 'manager.kabangwa@fuelorder.com',
    firstName: 'Kabangwa',
    lastName: 'Manager',
    role: 'station_manager',
    station: 'LAKE KABANGWA',
    department: 'Station Management',
    isActive: true,
  },
  {
    username: 'mgr_chingola',
    password: 'Chingola@2025',
    email: 'manager.chingola@fuelorder.com',
    firstName: 'Chingola',
    lastName: 'Manager',
    role: 'station_manager',
    station: 'LAKE CHINGOLA',
    department: 'Station Management',
    isActive: true,
  },
  // Tanzania Station
  {
    username: 'mgr_tunduma',
    password: 'Tunduma@2025',
    email: 'manager.tunduma@fuelorder.com',
    firstName: 'Tunduma',
    lastName: 'Manager',
    role: 'station_manager',
    station: 'LAKE TUNDUMA',
    department: 'Station Management',
    isActive: true,
  },
  // GBP Stations (Tanzania)
  {
    username: 'mgr_morogoro',
    password: 'Morogoro@2025',
    email: 'manager.morogoro@fuelorder.com',
    firstName: 'Morogoro',
    lastName: 'Manager',
    role: 'station_manager',
    station: 'GBP MOROGORO',
    department: 'Station Management',
    isActive: true,
  },
  {
    username: 'mgr_kange',
    password: 'Kange@2025',
    email: 'manager.kange@fuelorder.com',
    firstName: 'Kange',
    lastName: 'Manager',
    role: 'station_manager',
    station: 'GBP KANGE',
    department: 'Station Management',
    isActive: true,
  },
  // Infinity Station
  {
    username: 'mgr_infinity',
    password: 'Infinity@2025',
    email: 'manager.infinity@fuelorder.com',
    firstName: 'Infinity',
    lastName: 'Manager',
    role: 'station_manager',
    station: 'INFINITY',
    department: 'Station Management',
    isActive: true,
  },
];

// Super Manager - Can view all Zambian LAKE stations
const superManager = {
  username: 'super_manager',
  password: 'SuperMgr@2025',
  email: 'supermanager@fuelorder.com',
  firstName: 'Super',
  lastName: 'Manager',
  role: 'super_manager',
  department: 'Regional Management',
  isActive: true,
};

async function seedManagerUsers() {
  try {
    // Connect to database
    await mongoose.connect(config.mongodbUri);
    logger.info('Connected to MongoDB');

    const allManagers = [...stationManagers, superManager];
    const results = {
      created: [] as string[],
      updated: [] as string[],
      skipped: [] as string[],
    };

    for (const managerData of allManagers) {
      try {
        // Check if user already exists
        const existingUser = await User.findOne({ 
          $or: [
            { username: managerData.username },
            { email: managerData.email }
          ]
        });

        if (existingUser) {
          // Update existing user
          existingUser.role = managerData.role as any;
          if ('station' in managerData && managerData.station) {
            existingUser.station = managerData.station as string;
          }
          existingUser.isActive = true;
          await existingUser.save();
          results.updated.push(managerData.username);
          logger.info(`Updated user: ${managerData.username}`);
        } else {
          // Create new user
          await User.create(managerData);
          results.created.push(managerData.username);
          logger.info(`Created user: ${managerData.username}`);
        }
      } catch (err: any) {
        logger.error(`Error processing ${managerData.username}: ${err.message}`);
        results.skipped.push(managerData.username);
      }
    }

    // Print summary
    console.log('\n' + '='.repeat(70));
    console.log('                    MANAGER USERS SEED COMPLETE');
    console.log('='.repeat(70));
    console.log(`\n✅ Created: ${results.created.length} | 🔄 Updated: ${results.updated.length} | ⏭️  Skipped: ${results.skipped.length}\n`);
    
    console.log('='.repeat(70));
    console.log('                    STATION MANAGER CREDENTIALS');
    console.log('='.repeat(70));
    console.log('\n📍 Each station manager can ONLY view LPOs for their assigned station.\n');
    console.log('-'.repeat(70));
    console.log('| Station            | Username         | Password          |');
    console.log('-'.repeat(70));
    
    for (const mgr of stationManagers) {
      const station = mgr.station.padEnd(18);
      const username = mgr.username.padEnd(16);
      const password = mgr.password.padEnd(17);
      console.log(`| ${station} | ${username} | ${password} |`);
    }
    
    console.log('-'.repeat(70));
    console.log('\n');
    console.log('='.repeat(70));
    console.log('                    SUPER MANAGER CREDENTIALS');
    console.log('='.repeat(70));
    console.log('\n👑 Super Manager can view ALL Zambian LAKE stations (excludes Tanzania & Infinity).\n');
    console.log('-'.repeat(70));
    console.log('| Role               | Username         | Password          |');
    console.log('-'.repeat(70));
    console.log(`| Super Manager      | ${superManager.username.padEnd(16)} | ${superManager.password.padEnd(17)} |`);
    console.log('-'.repeat(70));
    console.log('\n');

    // Disconnect
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
    
    process.exit(0);
  } catch (error: any) {
    logger.error('Seed failed:', error.message);
    process.exit(1);
  }
}

// Run the seed
seedManagerUsers();
