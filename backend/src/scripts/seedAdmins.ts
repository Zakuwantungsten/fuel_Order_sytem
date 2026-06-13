import mongoose from 'mongoose';
import { User } from '../models/User';
import { config } from '../config';
import { logger } from '../utils';

const adminData = {
  username: 'zakuwantungsten',
  email: 'zakuwantungsten@gmail.com',
  password: 'Tungsten123',
  firstName: 'Zakuwan',
  lastName: 'Tungsten',
  role: 'super_admin',
  isActive: true,
};

async function seedAdmins() {
  try {
    await mongoose.connect(config.mongodbUri);
    logger.info('Connected to MongoDB');

    let user = await User.findOne({ username: adminData.username });

    if (user) {
      if (user.role !== 'super_admin') {
        user.role = 'super_admin' as any;
        await user.save();
        logger.info('Updated existing user to super_admin role');
      } else {
        logger.info('Super admin user already exists — no changes made');
      }
    } else {
      await User.create(adminData);
      logger.info('Super admin user created successfully');
    }

    logger.info('\n=== Account Summary ===');
    logger.info(`  Username: ${adminData.username}`);
    logger.info(`  Email:    ${adminData.email}`);
    logger.info(`  Role:     ${adminData.role}`);
    logger.info(`  Password: ${adminData.password}`);
    logger.info('\n⚠️  Change your password after first login!');

    process.exit(0);
  } catch (error) {
    logger.error('Error seeding admin user:', error);
    process.exit(1);
  }
}

seedAdmins();
