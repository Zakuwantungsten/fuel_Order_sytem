import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Import the Checkpoint model
import { Checkpoint } from '../models/Checkpoint';
import { requireMongoUri } from './requireMongoUri';

async function verifyCheckpoints() {
  try {
    // Connect to MongoDB
    // Was reading MONGO_URI (a typo) — the rest of the codebase uses MONGODB_URI.
    const mongoUri = requireMongoUri();
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB\n');

    // Get all checkpoints
    const allCheckpoints = await Checkpoint.find({ isDeleted: false }).sort({ order: 1 });
    console.log(`Total checkpoints: ${allCheckpoints.length}\n`);

    // Check coordinates
    const withCoordinates = allCheckpoints.filter(cp => cp.coordinates && cp.coordinates.latitude && cp.coordinates.longitude);
    const withoutCoordinates = allCheckpoints.filter(cp => !cp.coordinates || !cp.coordinates.latitude || !cp.coordinates.longitude);

    console.log(`Checkpoints WITH coordinates: ${withCoordinates.length}`);
    console.log(`Checkpoints WITHOUT coordinates: ${withoutCoordinates.length}\n`);

    if (withoutCoordinates.length > 0) {
      console.log('⚠️  Checkpoints missing coordinates:');
      withoutCoordinates.forEach(cp => {
        console.log(`  - ${cp.name} (${cp.displayName}) - Order: ${cp.order}`);
      });
      console.log('\n💡 Run seedCheckpoints.ts to add coordinates to all checkpoints.\n');
    } else {
      console.log('✅ All checkpoints have coordinates!\n');
      
      // Show sample
      console.log('Sample checkpoints:');
      allCheckpoints.slice(0, 5).forEach(cp => {
        console.log(`  ${cp.name} (${cp.displayName})`);
        console.log(`    Coordinates: ${cp.coordinates?.latitude}, ${cp.coordinates?.longitude}`);
        console.log(`    Order: ${cp.order}, Major: ${cp.isMajor}`);
      });
    }

    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

verifyCheckpoints();
