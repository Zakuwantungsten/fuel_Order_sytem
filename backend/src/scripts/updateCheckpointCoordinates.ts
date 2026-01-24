import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Import the Checkpoint model
import { Checkpoint } from '../models/Checkpoint';

// Real GPS coordinates for each checkpoint along the route
const coordinatesMap: Record<string, { latitude: number; longitude: number }> = {
  'TAVETA KENYA': { latitude: -3.4000, longitude: 37.6833 },
  'BONJE': { latitude: -3.9500, longitude: 37.8200 },
  'MOMBASA': { latitude: -4.0435, longitude: 39.6682 },
  'HOROHORO': { latitude: -4.6500, longitude: 38.9000 },
  'TANGA': { latitude: -5.0689, longitude: 39.0986 },
  'KANGE': { latitude: -5.1800, longitude: 38.9500 },
  'PONGWE': { latitude: -5.3000, longitude: 38.9200 },
  'MUHEZA': { latitude: -5.1714, longitude: 38.7780 },
  'SEGERA': { latitude: -5.6500, longitude: 38.7000 },
  'MANGA': { latitude: -5.8500, longitude: 38.6500 },
  'MSATA': { latitude: -6.0500, longitude: 38.5500 },
  'MKATA': { latitude: -6.3500, longitude: 38.3500 },
  'DSM TAHMEED YARD': { latitude: -6.7924, longitude: 39.2083 },
  'DSM': { latitude: -6.7924, longitude: 39.2083 },
  'KIMARA': { latitude: -6.7333, longitude: 39.2167 },
  'VIGWAZA': { latitude: -6.7000, longitude: 38.9000 },
  'KIBAHA': { latitude: -6.7699, longitude: 38.9159 },
  'MLANDIZI': { latitude: -6.7100, longitude: 38.5500 },
  'MDAULA': { latitude: -6.6500, longitude: 38.3500 },
  'CHALINZE': { latitude: -6.6978, longitude: 38.3687 },
  'MISUGUSUGU': { latitude: -6.5500, longitude: 37.8500 },
  'MIKESE': { latitude: -6.7500, longitude: 37.6500 },
  'MOROGORO': { latitude: -6.8213, longitude: 37.6628 },
  'DOMA': { latitude: -7.1000, longitude: 37.4000 },
  'MIKUMI': { latitude: -7.4067, longitude: 36.9786 },
  'MBUYUNI': { latitude: -7.7500, longitude: 36.5500 },
  'ILULA': { latitude: -7.9000, longitude: 36.0500 },
  'IRINGA': { latitude: -7.7767, longitude: 35.6988 },
  'IFUNDA': { latitude: -8.2500, longitude: 35.3500 },
  'MAFINGA': { latitude: -8.3828, longitude: 35.0638 },
  'MAKAMBAKO': { latitude: -8.8850, longitude: 34.2953 },
  'IGAWA': { latitude: -8.9500, longitude: 34.0500 },
  'IGURUSI': { latitude: -8.5500, longitude: 33.6500 },
  'MBEYA': { latitude: -8.9094, longitude: 33.4611 },
  'SONGWE': { latitude: -9.1500, longitude: 33.1500 },
  'TUNDUMA': { latitude: -9.3000, longitude: 32.7667 },
  'NAKONDE': { latitude: -9.3417, longitude: 32.7500 },
  'MKASI': { latitude: -9.6000, longitude: 32.5500 },
  'ISOKA': { latitude: -10.1333, longitude: 32.6333 },
  'KASAMA': { latitude: -10.2128, longitude: 31.1808 },
  'CHINSALI': { latitude: -10.5411, longitude: 32.0803 },
  'SHIWANGAMU': { latitude: -11.2500, longitude: 31.5500 },
  'MPIKA': { latitude: -11.8339, longitude: 31.4431 },
  'KALONJE': { latitude: -12.3000, longitude: 30.9500 },
  'MUNUNGA': { latitude: -12.7500, longitude: 30.4500 },
  'SERENJE': { latitude: -13.2306, longitude: 30.2350 },
  'MKUSHI': { latitude: -13.6233, longitude: 29.3939 },
  'KAPIRI MPOSHI': { latitude: -13.9714, longitude: 28.6697 },
  'KABWE': { latitude: -14.4469, longitude: 28.4464 },
  'LUSAKA': { latitude: -15.4167, longitude: 28.2833 },
  'CHISAMBA': { latitude: -14.8833, longitude: 28.0833 },
  'NDOLA': { latitude: -12.9585, longitude: 28.6366 },
  'KITWE': { latitude: -12.8028, longitude: 28.2139 },
  'CHINGOLA': { latitude: -12.5289, longitude: 27.8631 },
  'PETRODA': { latitude: -12.4000, longitude: 27.8000 },
  'KONKOLA': { latitude: -12.4200, longitude: 27.7500 },
  'SOLWEZI': { latitude: -12.1833, longitude: 26.4000 },
  'KASUMBALESA BORDER': { latitude: -12.268056, longitude: 27.794444 },
  'KASUMBALESA ZMB': { latitude: -12.268056, longitude: 27.794444 },
  'MOKAMBO BORDER': { latitude: -11.9833, longitude: 27.5000 },
  'SAKANIA': { latitude: -12.6333, longitude: 28.1500 },
  'KASUMBALESA DRC': { latitude: -12.256389, longitude: 27.802778 },
  'WHISKY': { latitude: -12.256389, longitude: 27.802778 },
  'WHISKEY': { latitude: -12.256389, longitude: 27.802778 },
  'KANYAKA': { latitude: -4.0335, longitude: 21.7501 },
  'LUMATU': { latitude: -11.5000, longitude: 27.3000 },
  'LUBUMBASHI': { latitude: -11.6667, longitude: 27.4667 },
  'KASENGA': { latitude: -10.3500, longitude: 28.6167 },
  'KASHOBWE': { latitude: -10.8333, longitude: 26.4000 },
  'LIKASI': { latitude: -10.989161, longitude: 26.739742 },
  'FUNGURUME': { latitude: -10.5667, longitude: 26.2833 },
  'TENKE': { latitude: -10.5000, longitude: 26.0000 },
  'MUTOSHI': { latitude: -10.6500, longitude: 25.5500 },
  'KOLWEZI': { latitude: -10.7167, longitude: 25.4667 },
  'KASUMBALESA': { latitude: -12.268056, longitude: 27.794444 },
  'MUFULIRA': { latitude: -12.5500, longitude: 28.2500 },
  'NCHANGA': { latitude: -12.5167, longitude: 27.8500 },
  'CHILILABOMBWE': { latitude: -12.3647, longitude: 27.8222 },
  'KALUMBILA': { latitude: -12.2667, longitude: 25.3167 },
  'CHAMBISHI': { latitude: -12.6500, longitude: 28.0500 },
};

async function updateCoordinates() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/fuel_order_system';
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Get all checkpoints
    const allCheckpoints = await Checkpoint.find({ isDeleted: false });
    console.log(`Found ${allCheckpoints.length} checkpoints in database\n`);

    let updated = 0;
    let skipped = 0;
    let notFound = 0;

    // Force update mode - set to true to overwrite existing coordinates
    const FORCE_UPDATE = true;

    for (const checkpoint of allCheckpoints) {
      const coords = coordinatesMap[checkpoint.name];
      
      if (!coords) {
        console.log(`⚠️  No coordinates found for: ${checkpoint.name}`);
        notFound++;
        continue;
      }

      if (checkpoint.coordinates && checkpoint.coordinates.latitude && checkpoint.coordinates.longitude && !FORCE_UPDATE) {
        console.log(`⏭️  Skipped (already has coordinates): ${checkpoint.name}`);
        skipped++;
        continue;
      }

      // Update checkpoint with coordinates
      const oldCoords = checkpoint.coordinates ? `(${checkpoint.coordinates.latitude}, ${checkpoint.coordinates.longitude})` : 'none';
      checkpoint.coordinates = coords;
      await checkpoint.save();
      
      console.log(`✅ Updated: ${checkpoint.name} → ${oldCoords} to (${coords.latitude}, ${coords.longitude})`);
      updated++;
    }

    console.log('\n' + '='.repeat(60));
    console.log('Summary:');
    console.log(`  ✅ Updated: ${updated}`);
    console.log(`  ⏭️  Skipped (already had coordinates): ${skipped}`);
    console.log(`  ⚠️  Not found in coordinates map: ${notFound}`);
    console.log('='.repeat(60) + '\n');

    if (updated > 0) {
      console.log('🎉 Coordinates successfully added to checkpoints!');
      console.log('💡 Refresh your Fleet Tracking page to see trucks on the map.\n');
    }

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

updateCoordinates();
