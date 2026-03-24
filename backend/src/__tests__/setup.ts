// Load test environment variables from .env.test before any imports
import dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(__dirname, '../../.env.test');
dotenv.config({ path: envPath });

// ✅ SECURITY: Test secrets now loaded from .env.test, not hardcoded
// Fallback values only if .env.test is not found
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-generated-fallback';
}
if (!process.env.JWT_REFRESH_SECRET) {
  process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key-for-testing-generated-fallback';
}

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongoServer: MongoMemoryServer;

// Connect to in-memory database before all tests
beforeAll(async () => {
  // Allow up to 2 minutes for the first-ever binary launch on this machine
  process.env.MONGOMS_STARTUP_TIMEOUT = '120000';
  mongoServer = await MongoMemoryServer.create({
    instance: { args: ['--quiet'] },
  });
  const mongoUri = mongoServer.getUri();
  
  await mongoose.connect(mongoUri);
}, 130000); // Jest timeout must exceed the MongoMemoryServer startup timeout

// Clear database between tests
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
});

// Disconnect and stop mongodb after all tests
afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await mongoServer.stop();
});
