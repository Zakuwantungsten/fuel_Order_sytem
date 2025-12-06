import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { FuelStationConfig } from '../models/FuelStationConfig';
import { RouteConfig } from '../models/RouteConfig';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const STATIONS_DATA = [
  // Zambia Stations (USD rate: 1.2)
  {
    stationName: 'LAKE CHILABOMBWE',
    defaultRate: 1.2,
    defaultLitersGoing: 260,
    defaultLitersReturning: 0,
    fuelRecordFieldGoing: 'zambiaGoing',
    formulaGoing: 'totalLiters + extraLiters - 900',
    createdBy: 'system_seed',
  },
  {
    stationName: 'LAKE NDOLA',
    defaultRate: 1.2,
    defaultLitersGoing: 0,
    defaultLitersReturning: 50,
    fuelRecordFieldReturning: 'zambiaReturn',
    formulaReturning: 'Math.max(0, (totalLiters + extraLiters) - 900)',
    createdBy: 'system_seed',
  },
  {
    stationName: 'LAKE KAPIRI',
    defaultRate: 1.2,
    defaultLitersGoing: 0,
    defaultLitersReturning: 350,
    fuelRecordFieldReturning: 'zambiaReturn',
    formulaReturning: 'Math.max(0, (totalLiters + extraLiters) - 900)',
    createdBy: 'system_seed',
  },
  {
    stationName: 'LAKE KITWE',
    defaultRate: 1.2,
    defaultLitersGoing: 260,
    defaultLitersReturning: 0,
    fuelRecordFieldGoing: 'zambiaGoing',
    formulaGoing: 'totalLiters + extraLiters - 900',
    createdBy: 'system_seed',
  },
  {
    stationName: 'LAKE KABANGWA',
    defaultRate: 1.2,
    defaultLitersGoing: 260,
    defaultLitersReturning: 0,
    fuelRecordFieldGoing: 'zambiaGoing',
    formulaGoing: 'totalLiters + extraLiters - 900',
    createdBy: 'system_seed',
  },
  {
    stationName: 'LAKE CHINGOLA',
    defaultRate: 1.2,
    defaultLitersGoing: 260,
    defaultLitersReturning: 0,
    fuelRecordFieldGoing: 'zambiaGoing',
    formulaGoing: 'totalLiters + extraLiters - 900',
    createdBy: 'system_seed',
  },
  // Tanzania Stations
  {
    stationName: 'LAKE TUNDUMA',
    defaultRate: 2875,
    defaultLitersGoing: 0,
    defaultLitersReturning: 100,
    fuelRecordFieldReturning: 'tundumaReturn',
    formulaReturning: 'Math.max(0, (totalLiters + extraLiters) - 900)',
    createdBy: 'system_seed',
  },
  {
    stationName: 'INFINITY',
    defaultRate: 2757,
    defaultLitersGoing: 450,
    defaultLitersReturning: 400,
    fuelRecordFieldGoing: 'mbeyaGoing',
    fuelRecordFieldReturning: 'mbeyaReturn',
    formulaGoing: 'totalLiters + extraLiters - 550',
    formulaReturning: 'Math.max(0, (totalLiters + extraLiters) - 900)',
    createdBy: 'system_seed',
  },
  {
    stationName: 'GBP MOROGORO',
    defaultRate: 2710,
    defaultLitersGoing: 100,
    defaultLitersReturning: 0,
    fuelRecordFieldGoing: 'moroGoing',
    formulaGoing: 'totalLiters + extraLiters - 550',
    createdBy: 'system_seed',
  },
  {
    stationName: 'GBP KANGE',
    defaultRate: 2730,
    defaultLitersGoing: 70,
    defaultLitersReturning: 0,
    fuelRecordFieldGoing: 'moroGoing',
    formulaGoing: 'totalLiters + extraLiters - 550',
    createdBy: 'system_seed',
  },
  {
    stationName: 'GPB KANGE',
    defaultRate: 2730,
    defaultLitersGoing: 70,
    defaultLitersReturning: 0,
    fuelRecordFieldGoing: 'moroGoing',
    formulaGoing: 'totalLiters + extraLiters - 550',
    createdBy: 'system_seed',
  },
];

const ROUTES_DATA = [
  // Zambia Routes
  {
    routeName: 'Dar to Kolwezi Route',
    origin: 'DAR',
    destination: 'KOLWEZI',
    destinationAliases: ['KOLWZ', 'KWZ'],
    defaultTotalLiters: 2400,
    description: 'Main route from Dar es Salaam to Kolwezi, DRC',
    createdBy: 'system_seed',
  },
  {
    routeName: 'Dar to Lubumbashi Route',
    origin: 'DAR',
    destination: 'LUBUMBASHI',
    destinationAliases: ['LUMBMBASHI', 'LBH'],
    defaultTotalLiters: 2400,
    description: 'Route from Dar es Salaam to Lubumbashi, DRC',
    createdBy: 'system_seed',
  },
  {
    routeName: 'Dar to Kitwe Route',
    origin: 'DAR',
    destination: 'KITWE',
    destinationAliases: ['KTW'],
    defaultTotalLiters: 2400,
    description: 'Route from Dar es Salaam to Kitwe, Zambia',
    createdBy: 'system_seed',
  },
  {
    routeName: 'Dar to Ndola Route',
    origin: 'DAR',
    destination: 'NDOLA',
    destinationAliases: ['NDL'],
    defaultTotalLiters: 2400,
    description: 'Route from Dar es Salaam to Ndola, Zambia',
    createdBy: 'system_seed',
  },
  {
    routeName: 'Dar to Chingola Route',
    origin: 'DAR',
    destination: 'CHINGOLA',
    destinationAliases: ['CHG'],
    defaultTotalLiters: 2400,
    description: 'Route from Dar es Salaam to Chingola, Zambia',
    createdBy: 'system_seed',
  },
  {
    routeName: 'Dar to Lusaka Route',
    origin: 'DAR',
    destination: 'LUSAKA',
    destinationAliases: ['LSK', 'LUSAK'],
    defaultTotalLiters: 2400,
    description: 'Route from Dar es Salaam to Lusaka, Zambia',
    createdBy: 'system_seed',
  },
  {
    routeName: 'Dar to Kapiri Route',
    origin: 'DAR',
    destination: 'KAPIRI',
    destinationAliases: ['KPR', 'KAPIRI MPOSHI'],
    defaultTotalLiters: 2400,
    description: 'Route from Dar es Salaam to Kapiri Mposhi, Zambia',
    createdBy: 'system_seed',
  },
  {
    routeName: 'Dar to Chilabombwe Route',
    origin: 'DAR',
    destination: 'CHILABOMBWE',
    destinationAliases: ['CHB', 'CHILAB'],
    defaultTotalLiters: 2400,
    description: 'Route from Dar es Salaam to Chilabombwe, Zambia',
    createdBy: 'system_seed',
  },
  {
    routeName: 'Dar to Kabangwa Route',
    origin: 'DAR',
    destination: 'KABANGWA',
    destinationAliases: ['KBW'],
    defaultTotalLiters: 2400,
    description: 'Route from Dar es Salaam to Kabangwa, Zambia',
    createdBy: 'system_seed',
  },
  // Tanga Routes
  {
    routeName: 'Tanga to Kolwezi Route',
    origin: 'TANGA',
    destination: 'KOLWEZI',
    destinationAliases: ['KOLWZ', 'KWZ'],
    defaultTotalLiters: 2400,
    description: 'Route from Tanga to Kolwezi, DRC',
    createdBy: 'system_seed',
  },
  {
    routeName: 'Tanga to Lubumbashi Route',
    origin: 'TANGA',
    destination: 'LUBUMBASHI',
    destinationAliases: ['LUMBMBASHI', 'LBH'],
    defaultTotalLiters: 2400,
    description: 'Route from Tanga to Lubumbashi, DRC',
    createdBy: 'system_seed',
  },
  {
    routeName: 'Tanga to Kitwe Route',
    origin: 'TANGA',
    destination: 'KITWE',
    destinationAliases: ['KTW'],
    defaultTotalLiters: 2400,
    description: 'Route from Tanga to Kitwe, Zambia',
    createdBy: 'system_seed',
  },
  {
    routeName: 'Tanga to Ndola Route',
    origin: 'TANGA',
    destination: 'NDOLA',
    destinationAliases: ['NDL'],
    defaultTotalLiters: 2400,
    description: 'Route from Tanga to Ndola, Zambia',
    createdBy: 'system_seed',
  },
  {
    routeName: 'Tanga to Lusaka Route',
    origin: 'TANGA',
    destination: 'LUSAKA',
    destinationAliases: ['LSK', 'LUSAK'],
    defaultTotalLiters: 2400,
    description: 'Route from Tanga to Lusaka, Zambia',
    createdBy: 'system_seed',
  },
  // DSM/Morogoro Routes (for trucks starting from DSM or going via Morogoro)
  {
    routeName: 'DSM to Kolwezi Route',
    origin: 'DSM',
    destination: 'KOLWEZI',
    destinationAliases: ['KOLWZ', 'KWZ'],
    defaultTotalLiters: 2400,
    description: 'Route from Dar es Salaam (DSM) to Kolwezi',
    createdBy: 'system_seed',
  },
  {
    routeName: 'DSM to Lubumbashi Route',
    origin: 'DSM',
    destination: 'LUBUMBASHI',
    destinationAliases: ['LUMBMBASHI', 'LBH'],
    defaultTotalLiters: 2400,
    description: 'Route from Dar es Salaam (DSM) to Lubumbashi',
    createdBy: 'system_seed',
  },
];

async function seedData() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI not defined in environment variables');
    }

    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Clear existing data (optional - comment out if you want to keep existing data)
    console.log('\n🗑️  Clearing existing stations and routes...');
    await FuelStationConfig.deleteMany({});
    await RouteConfig.deleteMany({});
    console.log('✅ Existing data cleared');

    // Seed Stations
    console.log('\n🏪 Seeding fuel stations...');
    const stationResults = await FuelStationConfig.insertMany(STATIONS_DATA);
    console.log(`✅ Created ${stationResults.length} fuel stations`);
    stationResults.forEach(station => {
      console.log(`   - ${station.stationName} (Rate: ${station.defaultRate})`);
    });

    // Seed Routes
    console.log('\n🛣️  Seeding routes...');
    const routeResults = await RouteConfig.insertMany(ROUTES_DATA);
    console.log(`✅ Created ${routeResults.length} routes`);
    routeResults.forEach(route => {
      console.log(`   - ${route.routeName} (${route.origin} → ${route.destination})`);
    });

    console.log('\n✨ Seeding completed successfully!');
    console.log(`\n📊 Summary:`);
    console.log(`   - Stations: ${stationResults.length}`);
    console.log(`   - Routes: ${routeResults.length}`);
    
  } catch (error: any) {
    console.error('❌ Error seeding data:', error.message);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

// Run seeder
seedData()
  .then(() => {
    console.log('\n🎉 Seeding process completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Seeding process failed:', error);
    process.exit(1);
  });
