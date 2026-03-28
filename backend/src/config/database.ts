import mongoose from 'mongoose';
import { config } from './index';
import logger from '../utils/logger';

export const connectDatabase = async (): Promise<void> => {
  try {
    mongoose.set('strictQuery', true);
    // NOTE: Do NOT enable sanitizeFilter globally — it recursively wraps $-prefixed
    // query operators ($in, $gte, $lte, $ne, etc.) inside $eq, which breaks all
    // queries using standard MongoDB operators. NoSQL injection prevention is
    // already handled by express-mongo-sanitize middleware.

    const options: mongoose.ConnectOptions = {
      maxPoolSize: 50,
      minPoolSize: 10,
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: 30000,
      heartbeatFrequencyMS: 10000,
      maxIdleTimeMS: 60000,
    };

    await mongoose.connect(config.mongodbUri, options);

    logger.info('MongoDB connected successfully');

    // Handle connection events
    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      logger.info('MongoDB connection closed through app termination');
      process.exit(0);
    });
  } catch (error) {
    logger.error('Error connecting to MongoDB:', error);
    process.exit(1);
  }
};

export default connectDatabase;
