/**
 * Geo Access Controller
 *
 * Provides geographic login aggregation and map data.
 * Uses the existing geolocation service to resolve IPs → coordinates.
 */
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import LoginActivity from '../models/LoginActivity';
import geolocationService from '../utils/geolocationService';

interface GeoEntry {
  city: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  loginCount: number;
  userCount: number;
  users: string[];
  lastSeen: string;
}

/**
 * GET /system-admin/geo-access?days=7
 * Returns aggregated login geography data.
 */
export async function getLoginGeography(req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const days = Math.min(90, Math.max(1, parseInt(req.query.days as string) || 7));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Aggregate unique IPs with login counts and user lists
    const ipAgg = await LoginActivity.aggregate([
      { $match: { loginAt: { $gte: since } } },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user',
          pipeline: [{ $project: { username: 1 } }],
        },
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$ipAddress',
          loginCount: { $sum: 1 },
          users: { $addToSet: '$user.username' },
          lastSeen: { $max: '$loginAt' },
        },
      },
      { $sort: { loginCount: -1 } },
      { $limit: 200 }, // cap to avoid excessive geolocation calls
    ]);

    // Resolve each unique IP to geo coordinates
    const locations: GeoEntry[] = [];
    const locationMap = new Map<string, GeoEntry>();

    for (const entry of ipAgg) {
      const ip = entry._id;
      if (!ip || ip === 'unknown') continue;

      const geo = await geolocationService.getIPGeolocation(ip);
      if (!geo || !geo.latitude || !geo.longitude) continue;

      // Group by city+country to consolidate nearby IPs
      const key = `${geo.city || 'Unknown'}|${geo.country}`;
      const existing = locationMap.get(key);

      if (existing) {
        existing.loginCount += entry.loginCount;
        for (const u of entry.users) {
          if (u && !existing.users.includes(u)) existing.users.push(u);
        }
        existing.userCount = existing.users.length;
        if (new Date(entry.lastSeen) > new Date(existing.lastSeen)) {
          existing.lastSeen = entry.lastSeen;
        }
      } else {
        const newEntry: GeoEntry = {
          city: geo.city || 'Unknown',
          country: geo.country,
          countryCode: geo.countryCode,
          latitude: geo.latitude,
          longitude: geo.longitude,
          loginCount: entry.loginCount,
          users: entry.users.filter(Boolean),
          userCount: entry.users.filter(Boolean).length,
          lastSeen: entry.lastSeen,
        };
        locationMap.set(key, newEntry);
      }
    }

    for (const loc of locationMap.values()) {
      locations.push(loc);
    }
    locations.sort((a, b) => b.loginCount - a.loginCount);

    // Detect unusual locations (any country not in the top 2 most common countries)
    const countryCounts = new Map<string, number>();
    for (const loc of locations) {
      countryCounts.set(loc.country, (countryCounts.get(loc.country) || 0) + loc.loginCount);
    }
    const sortedCountries = [...countryCounts.entries()].sort((a, b) => b[1] - a[1]);
    const normalCountries = new Set(sortedCountries.slice(0, 2).map(c => c[0]));

    const result = locations.map(loc => ({
      ...loc,
      unusual: !normalCountries.has(loc.country),
    }));

    return res.json({
      success: true,
      data: {
        locations: result,
        period: days,
        totalLogins: ipAgg.reduce((sum, e) => sum + e.loginCount, 0),
        uniqueIPs: ipAgg.length,
        countries: sortedCountries.map(([country, count]) => ({ country, count })),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to fetch login geography', error: error.message });
  }
}
