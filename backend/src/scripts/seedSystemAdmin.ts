import mongoose from 'mongoose';
import { User } from '../models';
import { config } from '../config';
import logger from '../utils/logger';

const systemAdminUser = {
  username: 'sysadmin',
  password: 'sysadmin123',
  email: 'sysadmin@fuelorder.com',
  firstName: 'System',
  lastName: 'Administrator',
  role: 'system_admin',
  department: 'IT',
  isActive: true,
};

async function seedSystemAdmin() {
  try {
    await mongoose.connect(config.mongodbUri);
    logger.info('Connected to MongoDB');

    // Check if system_admin already exists
    const existing = await User.findOne({ username: systemAdminUser.username });
    
    if (existing) {
      logger.info('System admin user already exists');
      // Update to system_admin role if not already
      if (existing.role !== 'system_admin') {
        existing.role = 'system_admin' as any;
        await existing.save();
        logger.info('Updated user to system_admin role');
      }
    } else {
      // Create new system admin user
      await User.create(systemAdminUser);
      logger.info('System admin user created successfully');
    }

    logger.info('System admin user details:');
    logger.info(`  Username: ${systemAdminUser.username}`);
    logger.info(`  Password: ${systemAdminUser.password}`);
    logger.info(`  Role: ${systemAdminUser.role}`);

    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    logger.error('Error seeding system admin:', error);
    process.exit(1);
  }
}

seedSystemAdmin();
