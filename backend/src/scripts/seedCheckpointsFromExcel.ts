/**
 * Seed checkpoints from locations.xlsx at the project root.
 *
 * Usage:
 *   npx ts-node src/scripts/seedCheckpointsFromExcel.ts
 *
 * The script reads every row from the "Locations" sheet, groups rows that share
 * the same # number (duplicate # rows are extra coordinate points for the same
 * location — only the first point is used as the primary coordinate), then
 * upserts each checkpoint by name so the script is safe to re-run.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import * as XLSX from 'xlsx';
import { Checkpoint } from '../models/Checkpoint';
import { requireMongoUri } from './requireMongoUri';

dotenv.config({ path: path.join(__dirname, '../../.env') });

// ---------------------------------------------------------------------------
// Path to locations.xlsx (project root, one level above /backend)
// ---------------------------------------------------------------------------
const EXCEL_PATH = path.join(__dirname, '../../../locations.xlsx');

// ---------------------------------------------------------------------------
// Locations where borderCrossing = true
// ---------------------------------------------------------------------------
const BORDER_CROSSINGS = new Set([
  'TUNDUMA-TZ', 'NAKONDE-ZMB', 'KASUMBALESA-DRC', 'KASUMBALESA-ZMB',
  'TAVETA KENYA', 'HOROHORO-TZ', 'LUNGALUNGA-KENYA',
]);

// ---------------------------------------------------------------------------
// Locations where isMajor = true
// ---------------------------------------------------------------------------
const MAJOR_LOCATIONS = new Set([
  'DSM', 'DSM TAHMEED YARD', 'DSM-KISARAWE',
  'TANGA-TZ', 'TANGA-YARD', 'MOMBASA-KENYA', 'TAVETA KENYA',
  'MOROGORO-TZ', 'IRINGA-TZ', 'MAFINGA-TZ', 'MAKAMBAKO-TZ', 'MBEYA-TZ',
  'TUNDUMA-TZ', 'NAKONDE-ZMB',
  'CHINSALI-ZMB', 'MPIKA-ZMB', 'SERENJE-ZMB', 'KAPIRI-MPOSHI-ZMB',
  'NDOLA-ZMB', 'KITWE-ZMB', 'CHINGOLA-ZMB', 'CHILILABOMBWE-ZMB',
  'KONKOLA-ZMB', 'KASUMBALESA-ZMB', 'KASUMBALESA-DRC',
  'LUBUMBASHI-DRC', 'KOLWEZI-DRC', 'LIKASI-DRC',
]);

// ---------------------------------------------------------------------------
// Locations where fuelAvailable = true
// ---------------------------------------------------------------------------
const FUEL_AVAILABLE = new Set([
  'DSM', 'DSM TAHMEED YARD', 'TANGA-TZ', 'TANGA-YARD',
  'MOROGORO-TZ', 'IRINGA-TZ', 'MAFINGA-TZ', 'MBEYA-TZ', 'TUNDUMA-TZ',
  'NAKONDE-ZMB', 'CHINSALI-ZMB', 'MPIKA-ZMB', 'SERENJE-ZMB',
  'MKUSHI-ZMB', 'KAPIRI-MPOSHI-ZMB', 'NDOLA-ZMB', 'KITWE-ZMB',
  'CHINGOLA-ZMB', 'CHAMBISHI-ZMB', 'CHILILABOMBWE-ZMB',
  'PETRODA-ZMB', 'KONKOLA-ZMB', 'KASUMBALESA-ZMB', 'KASUMBALESA-DRC',
  'LUBUMBASHI-DRC', 'KOLWEZI-DRC', 'LIKASI-DRC',
  'MOMBASA-KENYA', 'TAVETA KENYA',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Country = 'KE' | 'TZ' | 'ZM' | 'CD';
type Region =
  | 'KENYA'
  | 'TANZANIA_COASTAL'
  | 'TANZANIA_INTERIOR'
  | 'TANZANIA_BORDER'
  | 'ZAMBIA_NORTH'
  | 'ZAMBIA_CENTRAL'
  | 'ZAMBIA_COPPERBELT'
  | 'ZAMBIA_BORDER'
  | 'DRC';

function deriveCountry(name: string, lat: number, long: number): Country {
  const u = name.toUpperCase();
  if (u.includes('-TZ') || u.endsWith(' TZ')) return 'TZ';
  if (u.includes('-ZMB') || u.includes('-ZM') || u.endsWith(' ZMB') || u.endsWith(' ZM')) return 'ZM';
  if (u.includes('-DRC') || u.includes('-CD') || u.endsWith(' DRC') || u.endsWith(' CD')) return 'CD';
  if (u.includes('KENYA') || u.includes('-KE')) return 'KE';
  // No explicit suffix — use coordinates
  if (long > 34) return 'TZ';
  if (lat < -12.5 && long > 27 && long < 29.5) return 'CD'; // Sakania / DRC border area
  if (long < 33.5) return 'ZM';
  return 'TZ';
}

function deriveRegion(country: Country, lat: number, long: number, name: string): Region {
  if (country === 'KE') return 'KENYA';
  if (country === 'CD') return 'DRC';
  if (country === 'ZM') {
    const u = name.toUpperCase();
    if (u.includes('KASUMBALESA')) return 'ZAMBIA_BORDER';
    if (long > 31) return 'ZAMBIA_NORTH';
    if (long > 29) return 'ZAMBIA_CENTRAL';
    return 'ZAMBIA_COPPERBELT';
  }
  // TZ
  if (long > 36) return 'TANZANIA_COASTAL';
  if (lat < -8.5) return 'TANZANIA_BORDER';
  return 'TANZANIA_INTERIOR';
}

function toDisplayName(rawName: string): string {
  return rawName
    .replace(/-TZ$/i, '')
    .replace(/-ZMB$/i, '')
    .replace(/-ZM$/i, '')
    .replace(/-DRC$/i, '')
    .replace(/-CD$/i, '')
    .replace(/-KENYA$/i, '')
    .replace(/-KE$/i, '')
    .replace(/-/g, ' ')
    .trim()
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function generateAlternativeNames(name: string): string[] {
  const u = name.toUpperCase();
  const alts = new Set<string>();

  // Strip suffix → bare name
  const bare = u
    .replace(/-TZ$/, '').replace(/ TZ$/, '')
    .replace(/-ZMB$/, '').replace(/ ZMB$/, '')
    .replace(/-ZM$/, '').replace(/ ZM$/, '')
    .replace(/-DRC$/, '').replace(/ DRC$/, '')
    .replace(/-CD$/, '').replace(/ CD$/, '')
    .replace(/-KENYA$/, '').replace(/ KENYA$/, '')
    .replace(/-KE$/, '')
    .trim();

  if (bare && bare !== u) alts.add(bare);

  // Dash ↔ space variants
  if (u.includes('-')) alts.add(u.replace(/-/g, ' '));
  if (u.includes(' ') && !u.includes('-')) alts.add(u.replace(/ /g, '-'));

  // Country suffix as space (MIKUMI-TZ → MIKUMI TZ)
  const withSpace = u
    .replace(/-TZ$/, ' TZ')
    .replace(/-ZMB$/, ' ZMB')
    .replace(/-ZM$/, ' ZM')
    .replace(/-DRC$/, ' DRC')
    .replace(/-CD$/, ' CD')
    .replace(/-KENYA$/, ' KENYA');
  if (withSpace !== u) alts.add(withSpace);

  // Remove the main name itself
  alts.delete(u);

  return Array.from(alts).filter(a => a.length > 0);
}

// ---------------------------------------------------------------------------
// Parse the Excel file
// ---------------------------------------------------------------------------

interface LocationRow {
  num: number;
  name: string;
  pt: number;
  lat: number;
  long: number;
}

interface CheckpointEntry {
  num: number;
  name: string;
  lat: number;
  long: number;
}

function parseExcel(filePath: string): CheckpointEntry[] {
  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes('location')) || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rawRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  // Skip header row (row 0)
  const dataRows: LocationRow[] = [];
  let lastNum = 0;
  let lastName = '';

  for (let i = 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row || row.every(c => c === null || c === '')) continue;

    const num  = typeof row[0] === 'number' ? row[0] : lastNum;
    const name = typeof row[1] === 'string' && row[1].trim() ? row[1].trim().toUpperCase() : lastName;
    const pt   = typeof row[2] === 'number' ? row[2] : 1;
    const lat  = typeof row[3] === 'number' ? row[3] : null;
    const long = typeof row[4] === 'number' ? row[4] : null;

    if (lat === null || long === null || !name) continue;

    lastNum  = num;
    lastName = name;
    dataRows.push({ num, name, pt, lat, long });
  }

  // Group by # — keep only pt=1 (first point) per location
  const byNum = new Map<number, CheckpointEntry>();
  for (const row of dataRows) {
    if (!byNum.has(row.num)) {
      byNum.set(row.num, { num: row.num, name: row.name, lat: row.lat, long: row.long });
    }
  }

  // Return sorted by # number
  return Array.from(byNum.values()).sort((a, b) => a.num - b.num);
}

// ---------------------------------------------------------------------------
// Seed function
// ---------------------------------------------------------------------------

async function seedCheckpointsFromExcel(): Promise<void> {
  const mongoUri = requireMongoUri();
  await mongoose.connect(mongoUri);
  console.log('✅ Connected to MongoDB');

  const entries = parseExcel(EXCEL_PATH);
  console.log(`📋 Parsed ${entries.length} unique locations from ${path.basename(EXCEL_PATH)}`);

  let upserted = 0;
  let skipped  = 0;

  for (const entry of entries) {
    const country = deriveCountry(entry.name, entry.lat, entry.long);
    const region  = deriveRegion(country, entry.lat, entry.long, entry.name);

    const doc = {
      name:                     entry.name,
      displayName:              toDisplayName(entry.name),
      order:                    entry.num,
      country,
      region,
      coordinates:              { latitude: entry.lat, longitude: entry.long },
      alternativeNames:         generateAlternativeNames(entry.name),
      isActive:                 true,
      isMajor:                  MAJOR_LOCATIONS.has(entry.name),
      fuelAvailable:            FUEL_AVAILABLE.has(entry.name),
      borderCrossing:           BORDER_CROSSINGS.has(entry.name),
      estimatedDistanceFromStart: 0,
      createdBy:                'system',
      isDeleted:                false,
    };

    try {
      const result = await Checkpoint.updateOne(
        { name: entry.name },
        { $set: doc },
        { upsert: true }
      );
      if (result.upsertedCount > 0) {
        console.log(`  ➕ [${String(entry.num).padStart(2, '0')}] Inserted: ${entry.name} (${country}, ${region})`);
      } else {
        console.log(`  ✏️  [${String(entry.num).padStart(2, '0')}] Updated:  ${entry.name}`);
      }
      upserted++;
    } catch (err: any) {
      console.error(`  ❌ Failed: ${entry.name} — ${err.message}`);
      skipped++;
    }
  }

  const total = await Checkpoint.countDocuments({ isDeleted: false });
  console.log(`\n📊 Done — ${upserted} upserted, ${skipped} failed`);
  console.log(`📊 Total active checkpoints in DB: ${total}`);

  await mongoose.disconnect();
  console.log('👋 Disconnected from MongoDB');
}

seedCheckpointsFromExcel().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
