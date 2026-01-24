import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Import the Checkpoint model
import { Checkpoint } from '../models/Checkpoint';

const checkpoints = [
  // Tanzania Route - Taveta to Tanga
  { name: 'TAVETA KENYA', displayName: 'Taveta Kenya', alternativeNames: ['TAVETA', 'Taveta KE'], order: 1, isMajor: true, isActive: true, region: 'KENYA', country: 'KE', createdBy: 'system', fuelAvailable: true, borderCrossing: true, estimatedDistanceFromStart: 0, coordinates: { latitude: -3.4000, longitude: 37.6833 } },
  { name: 'BONJE', displayName: 'Bonje', alternativeNames: ['BONJE TZ'], order: 2, isMajor: false, isActive: true, region: 'TANZANIA_COASTAL', country: 'TZ', createdBy: 'system', fuelAvailable: false, borderCrossing: false, estimatedDistanceFromStart: 30, coordinates: { latitude: -3.9500, longitude: 37.8200 } },
  { name: 'MOMBASA', displayName: 'Mombasa', alternativeNames: ['MOMBASA PORT', 'MOMBASA KE', 'Mombasa Kenya'], order: 3, isMajor: true, isActive: true, region: 'KENYA', country: 'KE', createdBy: 'system', fuelAvailable: true, borderCrossing: false, estimatedDistanceFromStart: 50, coordinates: { latitude: -4.0435, longitude: 39.6682 } },
  { name: 'HOROHORO', displayName: 'Horohoro', alternativeNames: ['HOROHORO TZ'], order: 4, isMajor: false, isActive: true, region: 'TANZANIA_COASTAL', country: 'TZ', createdBy: 'system', fuelAvailable: false, borderCrossing: false, estimatedDistanceFromStart: 80, coordinates: { latitude: -4.6500, longitude: 38.9000 } },
  { name: 'TANGA', displayName: 'Tanga', alternativeNames: ['TANGA TZ'], order: 5, isMajor: true, isActive: true, region: 'TANZANIA_COASTAL', country: 'TZ', createdBy: 'system', fuelAvailable: true, borderCrossing: false, estimatedDistanceFromStart: 120, coordinates: { latitude: -5.0689, longitude: 39.0986 } },
  { name: 'KANGE', displayName: 'Kange', alternativeNames: ['KANGE TZ'], order: 6, isMajor: false, isActive: true, region: 'TANZANIA_COASTAL', country: 'TZ', createdBy: 'system', fuelAvailable: false, borderCrossing: false, estimatedDistanceFromStart: 150, coordinates: { latitude: -5.1800, longitude: 38.9500 } },
  { name: 'PONGWE', displayName: 'Pongwe', alternativeNames: ['PONGWE TZ'], order: 7, isMajor: false, isActive: true, region: 'TANZANIA_COASTAL', country: 'TZ', createdBy: 'system', fuelAvailable: false, borderCrossing: false, estimatedDistanceFromStart: 180, coordinates: { latitude: -5.3000, longitude: 38.9200 } },
  { name: 'MUHEZA', displayName: 'Muheza', alternativeNames: ['MUHEZA TZ'], order: 8, isMajor: false, isActive: true, region: 'TANZANIA_COASTAL', country: 'TZ', createdBy: 'system', fuelAvailable: true, borderCrossing: false, estimatedDistanceFromStart: 200, coordinates: { latitude: -5.1714, longitude: 38.7780 } },
  { name: 'SEGERA', displayName: 'Segera', alternativeNames: ['SEGERA TZ'], order: 9, isMajor: false, isActive: true, region: 'TANZANIA_COASTAL', country: 'TZ', createdBy: 'system', fuelAvailable: false, borderCrossing: false, estimatedDistanceFromStart: 230, coordinates: { latitude: -5.6500, longitude: 38.7000 } },
  { name: 'MANGA', displayName: 'Manga', alternativeNames: ['MANGA TZ'], order: 10, isMajor: false, isActive: true, region: 'TANZANIA_COASTAL', country: 'TZ', createdBy: 'system', fuelAvailable: false, borderCrossing: false, estimatedDistanceFromStart: 260, coordinates: { latitude: -5.8500, longitude: 38.6500 } },
  { name: 'MSATA', displayName: 'Msata', alternativeNames: ['MSATA TZ'], order: 11, isMajor: false, isActive: true, region: 'TANZANIA_COASTAL', country: 'TZ', createdBy: 'system', fuelAvailable: false, borderCrossing: false, estimatedDistanceFromStart: 290, coordinates: { latitude: -6.0500, longitude: 38.5500 } },
  { name: 'MKATA', displayName: 'Mkata', alternativeNames: ['MKATA TZ'], order: 12, isMajor: false, isActive: true, region: 'TANZANIA_INTERIOR', country: 'TZ', createdBy: 'system', fuelAvailable: false, borderCrossing: false, estimatedDistanceFromStart: 320, coordinates: { latitude: -6.3500, longitude: 38.3500 } },
  
  // DSM Area
  { name: 'DSM TAHMEED YARD', displayName: 'DSM Tahmeed Yard', alternativeNames: ['TAHMEED YARD', 'DSM YARD', 'DSM TAHMEED'], order: 13, isMajor: true, isActive: true, region: 'TANZANIA_COASTAL', country: 'TZ', createdBy: 'system', fuelAvailable: true, borderCrossing: false, estimatedDistanceFromStart: 350, coordinates: { latitude: -6.7924, longitude: 39.2083 } },
  { name: 'DSM', displayName: 'Dar Es Salaam', alternativeNames: ['DAR ES SALAAM', 'DAR', 'DSM PORT', 'Dar Es Salaam Port'], order: 14, isMajor: true, isActive: true, region: 'TANZANIA_COASTAL', country: 'TZ', createdBy: 'system', fuelAvailable: true, borderCrossing: false, estimatedDistanceFromStart: 360, coordinates: { latitude: -6.7924, longitude: 39.2083 } },
  { name: 'KIMARA', displayName: 'Kimara', alternativeNames: ['KIMARA TZ'], order: 15, isMajor: false, isActive: true, region: 'TANZANIA_COASTAL', country: 'TZ', createdBy: 'system', fuelAvailable: false, borderCrossing: false, estimatedDistanceFromStart: 380, coordinates: { latitude: -6.7333, longitude: 39.2167 } },
  { name: 'VIGWAZA', displayName: 'Vigwaza', alternativeNames: ['VIGWAZA TZ'], order: 16, isMajor: false, isActive: true, region: 'TANZANIA_INTERIOR', country: 'TZ', createdBy: 'system', fuelAvailable: false, borderCrossing: false, estimatedDistanceFromStart: 420, coordinates: { latitude: -6.7000, longitude: 38.9000 } },
  { name: 'KIBAHA', displayName: 'Kibaha', alternativeNames: ['KIBAHA TZ'], order: 17, isMajor: false, isActive: true, region: 'TANZANIA_COASTAL', country: 'TZ', createdBy: 'system', fuelAvailable: true, borderCrossing: false, estimatedDistanceFromStart: 440, coordinates: { latitude: -6.7699, longitude: 38.9159 } },
  { name: 'MLANDIZI', displayName: 'Mlandizi', alternativeNames: ['MLANDIZI TZ'], order: 18, isMajor: false, isActive: true, region: 'TANZANIA_INTERIOR', country: 'TZ', createdBy: 'system', fuelAvailable: false, borderCrossing: false, estimatedDistanceFromStart: 470, coordinates: { latitude: -6.7100, longitude: 38.5500 } },
  { name: 'MDAULA', displayName: 'Mdaula', alternativeNames: ['MDAULA TZ'], order: 19, isMajor: false, isActive: true, region: 'TANZANIA_INTERIOR', country: 'TZ', createdBy: 'system', fuelAvailable: false, borderCrossing: false, estimatedDistanceFromStart: 500, coordinates: { latitude: -6.6500, longitude: 38.3500 } },
  { name: 'CHALINZE', displayName: 'Chalinze', alternativeNames: ['CHALINZE TZ'], order: 20, isMajor: true, isActive: true, region: 'TANZANIA_COASTAL', country: 'TZ', createdBy: 'system', fuelAvailable: true, borderCrossing: false, estimatedDistanceFromStart: 530, coordinates: { latitude: -6.6978, longitude: 38.3687 } },
  { name: 'MISUGUSUGU', displayName: 'Misugusugu', alternativeNames: ['MISUGUSUGU TZ'], order: 21, isMajor: false, isActive: true, region: 'TANZANIA_INTERIOR', country: 'TZ', createdBy: 'system', fuelAvailable: false, borderCrossing: false, estimatedDistanceFromStart: 560, coordinates: { latitude: -6.5500, longitude: 37.8500 } },
  { name: 'MIKESE', displayName: 'Mikese', alternativeNames: ['MIKESE TZ'], order: 22, isMajor: false, isActive: true, region: 'TANZANIA_INTERIOR', country: 'TZ', createdBy: 'system', fuelAvailable: false, borderCrossing: false, estimatedDistanceFromStart: 590, coordinates: { latitude: -6.7500, longitude: 37.6500 } },
  { name: 'MOROGORO', displayName: 'Morogoro', alternativeNames: ['MOROGORO TZ'], order: 23, isMajor: true, isActive: true, region: 'TANZANIA_INTERIOR', country: 'TZ', createdBy: 'system', fuelAvailable: true, borderCrossing: false, estimatedDistanceFromStart: 620, coordinates: { latitude: -6.8213, longitude: 37.6628 } },
  { name: 'DOMA', displayName: 'Doma', alternativeNames: ['DOMA TZ'], order: 24, isMajor: false, isActive: true, region: 'TANZANIA_INTERIOR', country: 'TZ', createdBy: 'system', fuelAvailable: false, borderCrossing: false, estimatedDistanceFromStart: 650, coordinates: { latitude: -7.1000, longitude: 37.4000 } },
  { name: 'MIKUMI', displayName: 'Mikumi', alternativeNames: ['MIKUMI TZ', 'Mikumi National Park'], order: 25, isMajor: true, isActive: true, region: 'TANZANIA_INTERIOR', country: 'TZ', createdBy: 'system', fuelAvailable: true, borderCrossing: false, estimatedDistanceFromStart: 680, coordinates: { latitude: -7.4067, longitude: 36.9786 } },
  { name: 'MBUYUNI', displayName: 'Mbuyuni', alternativeNames: ['MBUYUNI TZ'], order: 26, isMajor: false, isActive: true, region: 'TANZANIA_INTERIOR', country: 'TZ', createdBy: 'system', fuelAvailable: false, borderCrossing: false, estimatedDistanceFromStart: 720, coordinates: { latitude: -7.7500, longitude: 36.5500 } },
  { name: 'ILULA', displayName: 'Ilula', alternativeNames: ['ILULA TZ'], order: 27, isMajor: false, isActive: true, region: 'TANZANIA_INTERIOR', country: 'TZ', createdBy: 'system', fuelAvailable: false, borderCrossing: false, estimatedDistanceFromStart: 750, coordinates: { latitude: -7.9000, longitude: 36.0500 } },
  { name: 'IRINGA', displayName: 'Iringa', alternativeNames: ['IRINGA TZ'], order: 28, isMajor: true, isActive: true, region: 'TANZANIA_INTERIOR', country: 'TZ', createdBy: 'system', fuelAvailable: true, borderCrossing: false, estimatedDistanceFromStart: 800, coordinates: { latitude: -7.7767, longitude: 35.6988 } },
  { name: 'IFUNDA', displayName: 'Ifunda', alternativeNames: ['IFUNDA TZ'], order: 29, isMajor: false, isActive: true, region: 'TANZANIA_INTERIOR', country: 'TZ', createdBy: 'system', fuelAvailable: false, borderCrossing: false, estimatedDistanceFromStart: 850, coordinates: { latitude: -8.2500, longitude: 35.3500 } },
  { name: 'MAFINGA', displayName: 'Mafinga', alternativeNames: ['MAFINGA TZ'], order: 30, isMajor: true, isActive: true, region: 'TANZANIA_INTERIOR', country: 'TZ', createdBy: 'system', fuelAvailable: true, borderCrossing: false, estimatedDistanceFromStart: 900, coordinates: { latitude: -8.3828, longitude: 35.0638 } },
  { name: 'MAKAMBAKO', displayName: 'Makambako', alternativeNames: ['MAKAMBAKO TZ'], order: 31, isMajor: false, isActive: true, region: 'TANZANIA_INTERIOR', country: 'TZ', createdBy: 'system', fuelAvailable: true, borderCrossing: false, estimatedDistanceFromStart: 950, coordinates: { latitude: -8.8850, longitude: 34.2953 } },
  { name: 'IGAWA', displayName: 'Igawa', alternativeNames: ['IGAWA TZ'], order: 32, isMajor: false, isActive: true, region: 'TANZANIA_INTERIOR', country: 'TZ', createdBy: 'system', fuelAvailable: false, borderCrossing: false, estimatedDistanceFromStart: 1000, coordinates: { latitude: -8.9500, longitude: 34.0500 } },
  { name: 'IGURUSI', displayName: 'Igurusi', alternativeNames: ['IGURUSI TZ'], order: 33, isMajor: false, isActive: true, region: 'TANZANIA_INTERIOR', country: 'TZ', createdBy: 'system', fuelAvailable: false, borderCrossing: false, estimatedDistanceFromStart: 1050, coordinates: { latitude: -8.5500, longitude: 33.6500 } },
  { name: 'MBEYA', displayName: 'Mbeya', alternativeNames: ['MBEYA TZ'], order: 34, isMajor: true, isActive: true, region: 'TANZANIA_INTERIOR', country: 'TZ', createdBy: 'system', fuelAvailable: true, borderCrossing: false, estimatedDistanceFromStart: 1100, coordinates: { latitude: -8.9094, longitude: 33.4611 } },
  { name: 'SONGWE', displayName: 'Songwe', alternativeNames: ['SONGWE TZ'], order: 35, isMajor: false, isActive: true, region: 'TANZANIA_BORDER', country: 'TZ', createdBy: 'system', fuelAvailable: false, borderCrossing: false, estimatedDistanceFromStart: 1150, coordinates: { latitude: -9.1500, longitude: 33.1500 } },
  { name: 'TUNDUMA', displayName: 'Tunduma', alternativeNames: ['TUNDUMA BORDER', 'TUNDUMA TZ-ZM', 'TUNDUMA TZ'], order: 36, isMajor: true, isActive: true, region: 'TANZANIA_BORDER', country: 'TZ', createdBy: 'system', fuelAvailable: true, borderCrossing: true, estimatedDistanceFromStart: 1200, coordinates: { latitude: -9.3000, longitude: 32.7667 } },
  
  // Zambia Route
  { name: 'NAKONDE', displayName: 'Nakonde', alternativeNames: ['NAKONDE ZM', 'NAKONDE BORDER'], order: 37, isMajor: true, isActive: true, region: 'ZAMBIA_NORTH', country: 'ZM', createdBy: 'system', fuelAvailable: true, borderCrossing: true, estimatedDistanceFromStart: 1200, coordinates: { latitude: -9.3417, longitude: 32.7500 } },
  { name: 'MKASI', displayName: 'Mkasi', alternativeNames: ['MKASI ZM'], order: 38, isMajor: false, isActive: true, region: 'ZAMBIA_NORTH', country: 'ZM', createdBy: 'system', fuelAvailable: false, borderCrossing: false, estimatedDistanceFromStart: 1230, coordinates: { latitude: -9.6000, longitude: 32.5500 } },
  { name: 'ISOKA', displayName: 'Isoka', alternativeNames: ['ISOKA ZM'], order: 39, isMajor: false, isActive: true, region: 'ZAMBIA_NORTH', country: 'ZM', createdBy: 'system', fuelAvailable: true, borderCrossing: false, estimatedDistanceFromStart: 1280, coordinates: { latitude: -10.1333, longitude: 32.6333 } },
  { name: 'CHINSALI', displayName: 'Chinsali', alternativeNames: ['CHINSALI ZM'], order: 40, isMajor: true, isActive: true, region: 'ZAMBIA_NORTH', country: 'ZM', createdBy: 'system', fuelAvailable: true, borderCrossing: false, estimatedDistanceFromStart: 1350, coordinates: { latitude: -10.5411, longitude: 32.0803 } },
  { name: 'SHIWANGAMU', displayName: 'Shiwangamu', alternativeNames: ['SHIWANGAMU ZM'], order: 41, isMajor: false, isActive: true, region: 'ZAMBIA_NORTH', country: 'ZM', createdBy: 'system', fuelAvailable: false, borderCrossing: false, estimatedDistanceFromStart: 1400, coordinates: { latitude: -11.2500, longitude: 31.5500 } },
  { name: 'MPIKA', displayName: 'Mpika', alternativeNames: ['MPIKA ZM'], order: 42, isMajor: true, isActive: true, region: 'ZAMBIA_NORTH', country: 'ZM', createdBy: 'system', fuelAvailable: true, borderCrossing: false, estimatedDistanceFromStart: 1450, coordinates: { latitude: -11.8339, longitude: 31.4431 } },
  { name: 'KALONJE', displayName: 'Kalonje', alternativeNames: ['KALONJE ZM'], order: 43, isMajor: false, isActive: true, region: 'ZAMBIA_NORTH', country: 'ZM', createdBy: 'system', fuelAvailable: false, borderCrossing: false, estimatedDistanceFromStart: 1500, coordinates: { latitude: -12.3000, longitude: 30.9500 } },
  { name: 'MUNUNGA', displayName: 'Mununga', alternativeNames: ['MUNUNGA ZM'], order: 44, isMajor: false, isActive: true, region: 'ZAMBIA_CENTRAL', country: 'ZM', createdBy: 'system', fuelAvailable: false, borderCrossing: false, estimatedDistanceFromStart: 1550, coordinates: { latitude: -12.7500, longitude: 30.4500 } },
  { name: 'SERENJE', displayName: 'Serenje', alternativeNames: ['SERENJE ZM'], order: 45, isMajor: true, isActive: true, region: 'ZAMBIA_CENTRAL', country: 'ZM', createdBy: 'system', fuelAvailable: true, borderCrossing: false, estimatedDistanceFromStart: 1600, coordinates: { latitude: -13.2306, longitude: 30.2350 } },
  { name: 'MKUSHI', displayName: 'Mkushi', alternativeNames: ['MKUSHI ZM'], order: 46, isMajor: false, isActive: true, region: 'ZAMBIA_CENTRAL', country: 'ZM', createdBy: 'system', fuelAvailable: true, borderCrossing: false, estimatedDistanceFromStart: 1680, coordinates: { latitude: -13.6233, longitude: 29.3939 } },
  { name: 'KAPIRI MPOSHI', displayName: 'Kapiri Mposhi', alternativeNames: ['KAPIRI MPOSHI ZM', 'KAPIRI'], order: 47, isMajor: true, isActive: true, region: 'ZAMBIA_CENTRAL', country: 'ZM', createdBy: 'system', fuelAvailable: true, borderCrossing: false, estimatedDistanceFromStart: 1750, coordinates: { latitude: -13.9714, longitude: 28.6697 } },
  
  // Copperbelt
  { name: 'NDOLA', displayName: 'Ndola', alternativeNames: ['NDOLA ZM'], order: 48, isMajor: true, isActive: true, region: 'ZAMBIA_COPPERBELT', country: 'ZM', createdBy: 'system', fuelAvailable: true, borderCrossing: false, estimatedDistanceFromStart: 1820, coordinates: { latitude: -12.9585, longitude: 28.6366 } },
  { name: 'KITWE', displayName: 'Kitwe', alternativeNames: ['KITWE ZM'], order: 49, isMajor: true, isActive: true, region: 'ZAMBIA_COPPERBELT', country: 'ZM', createdBy: 'system', fuelAvailable: true, borderCrossing: false, estimatedDistanceFromStart: 1870, coordinates: { latitude: -12.8028, longitude: 28.2139 } },
  { name: 'CHINGOLA', displayName: 'Chingola', alternativeNames: ['CHINGOLA ZM'], order: 50, isMajor: true, isActive: true, region: 'ZAMBIA_COPPERBELT', country: 'ZM', createdBy: 'system', fuelAvailable: true, borderCrossing: false, estimatedDistanceFromStart: 1920, coordinates: { latitude: -12.5289, longitude: 27.8631 } },
  { name: 'CHAMBISHI', displayName: 'Chambishi', alternativeNames: ['CHAMBISHI ZM'], order: 51, isMajor: false, isActive: true, region: 'ZAMBIA_COPPERBELT', country: 'ZM', createdBy: 'system', fuelAvailable: true, borderCrossing: false, estimatedDistanceFromStart: 1950, coordinates: { latitude: -12.6500, longitude: 28.0500 } },
  { name: 'CHILILABOMBWE', displayName: 'Chililabombwe', alternativeNames: ['CHILILABOMBWE ZM'], order: 52, isMajor: true, isActive: true, region: 'ZAMBIA_COPPERBELT', country: 'ZM', createdBy: 'system', fuelAvailable: true, borderCrossing: false, estimatedDistanceFromStart: 2000, coordinates: { latitude: -12.3647, longitude: 27.8222 } },
  { name: 'PETRODA', displayName: 'Petroda', alternativeNames: ['PETRODA ZM'], order: 53, isMajor: false, isActive: true, region: 'ZAMBIA_COPPERBELT', country: 'ZM', createdBy: 'system', fuelAvailable: true, borderCrossing: false, estimatedDistanceFromStart: 2030, coordinates: { latitude: -12.4000, longitude: 27.8000 } },
  { name: 'KONKOLA', displayName: 'Konkola', alternativeNames: ['KONKOLA ZM'], order: 54, isMajor: true, isActive: true, region: 'ZAMBIA_COPPERBELT', country: 'ZM', createdBy: 'system', fuelAvailable: true, borderCrossing: false, estimatedDistanceFromStart: 2060, coordinates: { latitude: -12.4200, longitude: 27.7500 } },
  
  // Border crossings to DRC
  { name: 'KASUMBALESA ZMB', displayName: 'Kasumbalesa (Zambia)', alternativeNames: ['KASUMBALESA ZM', 'KASUMBALESA ZAMBIA', 'KASUMBALESA-ZMB'], order: 55, isMajor: true, isActive: true, region: 'ZAMBIA_BORDER', country: 'ZM', createdBy: 'system', fuelAvailable: true, borderCrossing: true, estimatedDistanceFromStart: 2100, coordinates: { latitude: -12.5722, longitude: 27.8944 } },
  { name: 'SAKANIA', displayName: 'Sakania', alternativeNames: ['SAKANIA CD', 'SAKANIA DRC'], order: 56, isMajor: true, isActive: true, region: 'DRC', country: 'CD', createdBy: 'system', fuelAvailable: true, borderCrossing: false, estimatedDistanceFromStart: 2110, coordinates: { latitude: -12.6333, longitude: 28.1500 } },
  { name: 'KASUMBALESA DRC', displayName: 'Kasumbalesa (DRC)', alternativeNames: ['KASUMBALESA CD', 'KASUMBALESA-DRC', 'KASUMBALESA CONGO'], order: 57, isMajor: true, isActive: true, region: 'DRC', country: 'CD', createdBy: 'system', fuelAvailable: true, borderCrossing: true, estimatedDistanceFromStart: 2110, coordinates: { latitude: -12.5833, longitude: 27.9000 } },
  
  // DRC Destinations
  { name: 'WHISKY', displayName: 'Whisky', alternativeNames: ['WHISKY DRC', 'WHISKY-DRC', 'WHISKY CD'], order: 58, isMajor: false, isActive: true, region: 'DRC', country: 'CD', createdBy: 'system', fuelAvailable: true, borderCrossing: false, estimatedDistanceFromStart: 2150, coordinates: { latitude: -12.5000, longitude: 27.9500 } },
  { name: 'WHISKEY', displayName: 'Whiskey', alternativeNames: ['WHISKEY DRC', 'WHISKEY-DRC', 'WHISKEY CD'], order: 59, isMajor: true, isActive: true, region: 'DRC', country: 'CD', createdBy: 'system', fuelAvailable: true, borderCrossing: false, estimatedDistanceFromStart: 2150, coordinates: { latitude: -12.5000, longitude: 27.9500 } },
  { name: 'KANYAKA', displayName: 'Kanyaka', alternativeNames: ['KANYAKA DRC', 'KANYAKA-DRC', 'KANYAKA CD'], order: 60, isMajor: false, isActive: true, region: 'DRC', country: 'CD', createdBy: 'system', fuelAvailable: false, borderCrossing: false, estimatedDistanceFromStart: 2200, coordinates: { latitude: -11.7500, longitude: 27.4500 } },
  { name: 'LUMATU', displayName: 'Lumatu', alternativeNames: ['LUMATU DRC', 'LUMATU CD'], order: 61, isMajor: false, isActive: true, region: 'DRC', country: 'CD', createdBy: 'system', fuelAvailable: false, borderCrossing: false, estimatedDistanceFromStart: 2250, coordinates: { latitude: -11.5000, longitude: 27.3000 } },
  { name: 'LUBUMBASHI', displayName: 'Lubumbashi', alternativeNames: ['LUBUMBASHI CD', 'LUBUMBASHI DRC'], order: 62, isMajor: true, isActive: true, region: 'DRC', country: 'CD', createdBy: 'system', fuelAvailable: true, borderCrossing: false, estimatedDistanceFromStart: 2300, coordinates: { latitude: -11.6667, longitude: 27.4667 } },
  { name: 'LIKASI', displayName: 'Likasi', alternativeNames: ['LIKASI CD', 'LIKASI DRC', 'LIKASI-DRC'], order: 63, isMajor: true, isActive: true, region: 'DRC', country: 'CD', createdBy: 'system', fuelAvailable: true, borderCrossing: false, estimatedDistanceFromStart: 2400, coordinates: { latitude: -10.9810, longitude: 26.7333 } },
  { name: 'FUNGURUME', displayName: 'Fungurume', alternativeNames: ['FUNGURUME CD', 'FUNGURUME DRC'], order: 64, isMajor: false, isActive: true, region: 'DRC', country: 'CD', createdBy: 'system', fuelAvailable: false, borderCrossing: false, estimatedDistanceFromStart: 2500, coordinates: { latitude: -10.5667, longitude: 26.2833 } },
  { name: 'KOLWEZI', displayName: 'Kolwezi', alternativeNames: ['KOLWEZI CD', 'KOLWEZI DRC'], order: 65, isMajor: true, isActive: true, region: 'DRC', country: 'CD', createdBy: 'system', fuelAvailable: true, borderCrossing: false, estimatedDistanceFromStart: 2600, coordinates: { latitude: -10.7167, longitude: 25.4667 } },
];

async function seedCheckpoints() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/fuel_order';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Clear existing checkpoints
    const deleteResult = await Checkpoint.deleteMany({});
    console.log(`🗑️  Deleted ${deleteResult.deletedCount} existing checkpoints`);

    // Insert new checkpoints
    const insertedCheckpoints = await Checkpoint.insertMany(checkpoints);
    console.log(`✅ Successfully seeded ${insertedCheckpoints.length} checkpoints`);

    // Verify count
    const count = await Checkpoint.countDocuments();
    console.log(`📊 Total checkpoints in database: ${count}`);

    // Show first and last checkpoints
    const first = await Checkpoint.findOne().sort({ order: 1 });
    const last = await Checkpoint.findOne().sort({ order: -1 });
    console.log(`\n🚩 First checkpoint: ${first?.name} (Order: ${first?.order})`);
    console.log(`🏁 Last checkpoint: ${last?.name} (Order: ${last?.order})`);

    console.log('\n✨ Checkpoint seeding completed successfully!');
  } catch (error) {
    console.error('❌ Error seeding checkpoints:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Run the seed function
seedCheckpoints();
