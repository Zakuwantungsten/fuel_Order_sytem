import mongoose from 'mongoose';
import { User } from '../models';
import { config } from '../config';
import logger from '../utils/logger';

const users = [
  {
    username: 'superadmin',
    password: 'admin123',
    email: 'super@fuelorder.com',
    firstName: 'Super',
    lastName: 'Administrator',
    role: 'super_admin',
    department: 'IT',
    isActive: true,
  },
  {
    username: 'admin',
    password: 'admin123',
    email: 'admin@fuelorder.com',
    firstName: 'Admin',
    lastName: 'User',
    role: 'admin',
    department: 'Operations',
    isActive: true,
  },
  {
    username: 'manager',
    password: 'manager123',
    email: 'manager@fuelorder.com',
    firstName: 'John',
    lastName: 'Manager',
    role: 'manager',
    department: 'Operations',
    isActive: true,
  },
  {
    username: 'supervisor',
    password: 'super123',
    email: 'supervisor@fuelorder.com',
    firstName: 'Jane',
    lastName: 'Supervisor',
    role: 'supervisor',
    department: 'Logistics',
    isActive: true,
  },
  {
    username: 'clerk',
    password: 'clerk123',
    email: 'clerk@fuelorder.com',
    firstName: 'Alice',
    lastName: 'Clerk',
    role: 'clerk',
    department: 'Data Entry',
    isActive: true,
  },
  {
    username: 'driver1',
    password: 'driver123',
    email: 'driver1@fuelorder.com',
    firstName: 'Bob',
    lastName: 'Driver',
    role: 'driver',
    department: 'Transport',
    isActive: true,
  },
  {
    username: 'viewer',
    password: 'viewer123',
    email: 'viewer@fuelorder.com',
    firstName: 'Charlie',
    lastName: 'Viewer',
    role: 'viewer',
    department: 'Monitoring',
    isActive: true,
  },
  {
    username: 'fuelorder',
    password: 'fuel123',
    email: 'fuelorder@company.com',
    firstName: 'Fuel',
    lastName: 'OrderMaker',
    role: 'fuel_order_maker',
    department: 'Operations',
    isActive: true,
  },
  {
    username: 'boss',
    password: 'boss123',
    email: 'boss@company.com',
    firstName: 'The',
    lastName: 'Boss',
    role: 'boss',
    department: 'Executive',
    isActive: true,
  },
  {
    username: 'yardman',
    password: 'yard123',
    email: 'yard@company.com',
    firstName: 'Yard',
    lastName: 'Personnel',
    role: 'yard_personnel',
    department: 'Yard Operations',
    isActive: true,
  },
  {
    username: 'attendant',
    password: 'fuel123',
    email: 'attendant@station.com',
    firstName: 'Fuel',
    lastName: 'Attendant',
    role: 'fuel_attendant',
    department: 'Station',
    station: 'LAKE KAPIRI',
    isActive: true,
  },
  {
    username: 'stationmgr',
    password: 'station123',
    email: 'manager@station.com',
    firstName: 'Station',
    lastName: 'Manager',
    role: 'station_manager',
    department: 'Station Management',
    station: 'LAKE KAPIRI',
    isActive: true,
  },
  {
    username: 'truck_driver',
    password: 'drive123',
    email: 'driver@transport.com',
    firstName: 'Michael',
    lastName: 'Tembo',
    role: 'driver',
    department: 'Transport',
    truckNo: 'T699 DXY',
    currentDO: '6038',
    isActive: true,
  },
  {
    username: 'paymentmgr',
    password: 'payment123',
    email: 'payment@company.com',
    firstName: 'Bilal',
    lastName: 'PaymentManager',
    role: 'payment_manager',
    department: 'Finance',
    isActive: true,
  },
  {
    username: 'dar_yard',
    password: 'dar123',
    email: 'dar@yard.com',
    firstName: 'Dar',
    lastName: 'Yardman',
    role: 'dar_yard',
    department: 'Dar Yard',
    yard: 'DAR YARD',
    isActive: true,
  },
  {
    username: 'tanga_yard',
    password: 'tanga123',
    email: 'tanga@yard.com',
    firstName: 'Tanga',
    lastName: 'Yardman',
    role: 'tanga_yard',
    department: 'Tanga Yard',
    yard: 'TANGA YARD',
    isActive: true,
  },
  {
    username: 'mmsa_yard',
    password: 'mmsa123',
    email: 'mmsa@yard.com',
    firstName: 'MMSA',
    lastName: 'Yardman',
    role: 'mmsa_yard',
    department: 'MMSA Yard',
    yard: 'MMSA YARD',
    isActive: true,
  },
];

async function seedUsers() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongodbUri);
    logger.info('Connected to MongoDB');

    // Clear existing users (optional - comment out if you want to keep existing users)
    const existingCount = await User.countDocuments();
    logger.info(`Found ${existingCount} existing users`);

    // Create users
    let createdCount = 0;
    let skippedCount = 0;

    for (const userData of users) {
      try {
        // Check if user already exists
        const existingUser = await User.findOne({
          $or: [{ username: userData.username }, { email: userData.email }],
        });

        if (existingUser) {
          logger.info(`User ${userData.username} already exists, skipping...`);
          skippedCount++;
          continue;
        }

        // Create user
        await User.create(userData);
        logger.info(`Created user: ${userData.username} (${userData.role})`);
        createdCount++;
      } catch (error: any) {
        logger.error(`Error creating user ${userData.username}:`, error.message);
      }
    }

    logger.info(`\nSeed completed:`);
    logger.info(`- Created: ${createdCount} users`);
    logger.info(`- Skipped: ${skippedCount} users`);
    logger.info(`- Total users in database: ${await User.countDocuments()}`);

    // Close connection
    await mongoose.connection.close();
    logger.info('Database connection closed');
    process.exit(0);
  } catch (error: any) {
    logger.error('Seed failed:', error);
    process.exit(1);
  }
}

// Run seed
seedUsers();
