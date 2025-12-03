import mongoose from 'mongoose';
import { User } from '../models';
import { config } from '../config';
import logger from '../utils/logger';

const driverUser = {
  username: 't849eks',
  password: 'driver123',
  email: 't849eks@transport.com',
  firstName: 'Driver',
  lastName: 'T849EKS',
  role: 'driver',
  department: 'Transport',
  truckNo: 'T849 EKS',
  isActive: true,
};

async function seedDriver() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongodbUri);
    logger.info('Connected to MongoDB');

    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [
        { username: driverUser.username },
        { truckNo: driverUser.truckNo }
      ]
    });

    if (existingUser) {
      logger.info(`Driver user for truck ${driverUser.truckNo} already exists:`);
      logger.info(`  Username: ${existingUser.username}`);
      logger.info(`  Truck No: ${existingUser.truckNo}`);
      logger.info('Skipping creation...');
    } else {
      // Create the driver user
      const user = new User(driverUser);
      await user.save();
      
      logger.info('✓ Driver user created successfully!');
      logger.info('');
      logger.info('╔════════════════════════════════════════════╗');
      logger.info('║         DRIVER USER CREATED                ║');
      logger.info('╠════════════════════════════════════════════╣');
      logger.info(`║  Username:  ${driverUser.username.padEnd(30)}║`);
      logger.info(`║  Password:  ${driverUser.password.padEnd(30)}║`);
      logger.info(`║  Truck No:  ${driverUser.truckNo.padEnd(30)}║`);
      logger.info(`║  Name:      ${(driverUser.firstName + ' ' + driverUser.lastName).padEnd(30)}║`);
      logger.info(`║  Role:      ${driverUser.role.padEnd(30)}║`);
      logger.info('╚════════════════════════════════════════════╝');
    }

    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
    process.exit(0);
  } catch (error: any) {
    logger.error('Failed to seed driver user:', error.message);
    process.exit(1);
  }
}

// Run the seed
seedDriver();
