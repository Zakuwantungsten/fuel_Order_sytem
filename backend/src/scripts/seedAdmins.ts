import mongoose from 'mongoose';
import { User } from '../models/User';
import { config } from '../config';
import { logger } from '../utils';

const superAdminData = {
  username: 'superadmin',
  email: 'superadmin@fuelorder.com',
  password: 'SuperAdmin@123',
  firstName: 'Super',
  lastName: 'Admin',
  role: 'super_admin',
  isActive: true,
};

const adminData = {
  username: 'admin',
  email: 'admin@fuelorder.com',
  password: 'Admin@123',
  firstName: 'System',
  lastName: 'Admin',
  role: 'admin',
  isActive: true,
};

async function seedAdmins() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongodbUri);
    logger.info('Connected to MongoDB');

    // Check if super_admin already exists
    let superAdmin = await User.findOne({ username: superAdminData.username });
    if (superAdmin) {
      // Update to super_admin role if not already
      if (superAdmin.role !== 'super_admin') {
        superAdmin.role = 'super_admin' as any;
        await superAdmin.save();
        logger.info('Updated existing user to super_admin role');
      } else {
        logger.info('Super Admin user already exists');
      }
    } else {
      // Create new super admin
      superAdmin = await User.create(superAdminData);
      logger.info('Super Admin user created successfully');
      logger.info(`Username: ${superAdminData.username}`);
      logger.info(`Password: ${superAdminData.password}`);
    }

    // Check if admin already exists
    let admin = await User.findOne({ username: adminData.username });
    if (admin) {
      // Update to admin role if not already
      if (admin.role !== 'admin') {
        admin.role = 'admin' as any;
        await admin.save();
        logger.info('Updated existing user to admin role');
      } else {
        logger.info('Admin user already exists');
      }
    } else {
      // Create new admin
      admin = await User.create(adminData);
      logger.info('Admin user created successfully');
      logger.info(`Username: ${adminData.username}`);
      logger.info(`Password: ${adminData.password}`);
    }

    logger.info('\n=== Admin Accounts Summary ===');
    logger.info('Super Admin:');
    logger.info(`  Username: ${superAdminData.username}`);
    logger.info(`  Email: ${superAdminData.email}`);
    logger.info(`  Default Password: ${superAdminData.password}`);
    logger.info('\nAdmin:');
    logger.info(`  Username: ${adminData.username}`);
    logger.info(`  Email: ${adminData.email}`);
    logger.info(`  Default Password: ${adminData.password}`);
    logger.info('\n⚠️  Please change these passwords after first login!');

    process.exit(0);
  } catch (error) {
    logger.error('Error seeding admin users:', error);
    process.exit(1);
  }
}

seedAdmins();
