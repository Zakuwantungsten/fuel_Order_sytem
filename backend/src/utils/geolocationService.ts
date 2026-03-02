import axios from 'axios';
import { logger } from '../utils';

interface GeoLocation {
  ip: string;
  country: string;
  countryCode: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  timestamp: Date;
}

interface UserLocationHistory {
  username: string;
  lastLocation?: GeoLocation;
  locationHistory: GeoLocation[];
  lastUpdate: Date;
}

class GeolocationService {
  private isEnabled: boolean = false;
  private userLocationCache: Map<string, UserLocationHistory> = new Map();
  private ipGeoCache: Map<string, { data: GeoLocation | null; expires: number }> = new Map();
  private apiProvider: 'ipapi' | 'ipinfo' | 'maxmind' = 'ipapi';
  private apiKey: string | null = null;

  constructor() {
    this.initializeGeolocation();
  }

  /**
   * Initialize geolocation service
   */
  private initializeGeolocation(): void {
    try {
      this.apiKey = process.env.GEOLOCATION_API_KEY || null;
      const provider = (process.env.GEOLOCATION_PROVIDER || 'ipapi') as
        | 'ipapi'
        | 'ipinfo'
        | 'maxmind';

      if (provider === 'ipinfo' && !this.apiKey) {
        logger.warn('Geolocation disabled: ipinfo requires API key');
        this.isEnabled = false;
        return;
      }

      if (provider === 'maxmind' && !this.apiKey) {
        logger.warn('Geolocation disabled: MaxMind requires account ID');
        this.isEnabled = false;
        return;
      }

      this.apiProvider = provider;
      this.isEnabled = true;
      logger.info(`Geolocation service enabled (provider: ${provider})`);

      // Start cleanup every hour
      setInterval(() => this.cleanupOldLocations(), 60 * 60 * 1000);
    } catch (error: any) {
      logger.error(`Failed to initialize geolocation: ${error.message}`);
      this.isEnabled = false;
    }
  }

  /**
   * Check if an IP is local/private (not resolvable by external APIs)
   */
  private isLocalIP(ip: string): boolean {
    return (
      !ip ||
      ip === '::1' ||
      ip === '127.0.0.1' ||
      ip === '::ffff:127.0.0.1' ||
      ip.startsWith('10.') ||
      ip.startsWith('192.168.') ||
      ip.startsWith('172.16.') ||
      ip.startsWith('172.17.') ||
      ip.startsWith('172.18.') ||
      ip.startsWith('172.19.') ||
      ip.startsWith('172.2') || // 172.20-29
      ip.startsWith('172.30.') ||
      ip.startsWith('172.31.') ||
      ip.startsWith('fe80:') ||
      ip.startsWith('fc00:') ||
      ip.startsWith('fd') ||
      ip === '0.0.0.0'
    );
  }

  /**
   * Get geolocation for IP address
   */
  async getIPGeolocation(ipAddress: string): Promise<GeoLocation | null> {
    if (!this.isEnabled) {
      return null;
    }

    // Skip local/private IPs — external APIs can't resolve them
    if (this.isLocalIP(ipAddress)) {
      return {
        ip: ipAddress,
        country: 'Local',
        countryCode: 'LO',
        city: 'Localhost',
        timestamp: new Date(),
      };
    }

    // Check IP-level cache (10 minute TTL)
    const cached = this.ipGeoCache.get(ipAddress);
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }

    try {
      let response;
      let result: GeoLocation | null = null;

      if (this.apiProvider === 'ipapi') {
        // Free API, no key required
        response = await axios.get(`https://ipapi.co/${ipAddress}/json/`, {
          timeout: 3000,
        });

        result = {
          ip: ipAddress,
          country: response.data.country_name || 'Unknown',
          countryCode: response.data.country_code || 'XX',
          city: response.data.city,
          latitude: response.data.latitude,
          longitude: response.data.longitude,
          timestamp: new Date(),
        };
      } else if (this.apiProvider === 'ipinfo') {
        // ipinfo.io requires API key
        response = await axios.get(
          `https://ipinfo.io/${ipAddress}?token=${this.apiKey}`,
          {
            timeout: 3000,
          }
        );

        const [latitude, longitude] = response.data.loc
          ? response.data.loc.split(',').map(Number)
          : [null, null];

        result = {
          ip: ipAddress,
          country: response.data.country || 'Unknown',
          countryCode: response.data.country || 'XX',
          city: response.data.city,
          latitude,
          longitude,
          timestamp: new Date(),
        };
      } else if (this.apiProvider === 'maxmind') {
        // MaxMind GeoIP2 (requires self-hosted or subscription)
        response = await axios.get(
          `https://geoip.maxmind.com/geoip/v2.1/country/${ipAddress}`,
          {
            auth: {
              username: 'account_id_here',
              password: this.apiKey || '',
            },
            timeout: 3000,
          }
        );

        result = {
          ip: ipAddress,
          country: response.data.country.names.en || 'Unknown',
          countryCode: response.data.country.iso_code || 'XX',
          timestamp: new Date(),
        };
      }

      // Cache the result (10 minute TTL)
      if (result) {
        this.ipGeoCache.set(ipAddress, { data: result, expires: Date.now() + 10 * 60 * 1000 });
      }
      return result;
    } catch (error: any) {
      const is429 = error?.response?.status === 429;
      if (is429) {
        logger.warn(`Geolocation API rate limited for IP ${ipAddress} — skipping`);
        // Cache null for 5 minutes to avoid hammering the API
        this.ipGeoCache.set(ipAddress, { data: null, expires: Date.now() + 5 * 60 * 1000 });
      } else {
        logger.warn(`Failed to get geolocation for IP ${ipAddress}: ${error.message}`);
      }
      return null;
    }
  }

  /**
   * Check if user is logging in from a new country
   */
  async detectNewCountryLogin(
    username: string,
    ipAddress: string
  ): Promise<{ isNewCountry: boolean; newCountry?: string; previousCountry?: string }> {
    if (!this.isEnabled) {
      return { isNewCountry: false };
    }

    try {
      const geoLocation = await this.getIPGeolocation(ipAddress);
      if (!geoLocation) {
        return { isNewCountry: false };
      }

      const history = this.userLocationCache.get(username);

      if (!history) {
        // First login from this user, record it
        this.userLocationCache.set(username, {
          username,
          lastLocation: geoLocation,
          locationHistory: [geoLocation],
          lastUpdate: new Date(),
        });
        return { isNewCountry: false }; // Can't detect new if no history
      }

      const previousCountry = history.lastLocation?.country;
      const isNewCountry = previousCountry && previousCountry !== geoLocation.country;

      if (isNewCountry) {
        // Update history
        history.locationHistory.push(geoLocation);
        history.lastLocation = geoLocation;
        history.lastUpdate = new Date();
        this.userLocationCache.set(username, history);
      }

      return {
        isNewCountry: !!isNewCountry,
        newCountry: geoLocation.country,
        previousCountry,
      };
    } catch (error: any) {
      logger.error(`Error detecting new country login: ${error.message}`);
      return { isNewCountry: false };
    }
  }

  /**
   * Check for impossible travel (user in two countries too fast)
   */
  async detectImpossibleTravel(
    username: string,
    ipAddress: string,
    maxMinutesBetweenLogins: number = 120 // 2 hours default
  ): Promise<{ isImpossible: boolean; details?: string }> {
    if (!this.isEnabled) {
      return { isImpossible: false };
    }

    try {
      const newLocation = await this.getIPGeolocation(ipAddress);
      if (!newLocation) {
        return { isImpossible: false };
      }

      const history = this.userLocationCache.get(username);
      if (!history || !history.lastLocation) {
        return { isImpossible: false }; // No previous location
      }

      const lastLogin = history.lastLocation;
      const timeDiffMinutes =
        (newLocation.timestamp.getTime() - lastLogin.timestamp.getTime()) / (60 * 1000);

      // Calculate distance using Haversine formula (rough approximation)
      if (
        lastLogin.latitude &&
        lastLogin.longitude &&
        newLocation.latitude &&
        newLocation.longitude
      ) {
        const distance = this.calculateDistance(
          lastLogin.latitude,
          lastLogin.longitude,
          newLocation.latitude,
          newLocation.longitude
        );

        // Speed of airplane: ~900 km/h, speed of car: ~100 km/h max
        // Assume human can't travel more than 1000 km per hour realistically
        const maxDistance = 1000 * (timeDiffMinutes / 60);

        if (distance > maxDistance && timeDiffMinutes < maxMinutesBetweenLogins) {
          return {
            isImpossible: true,
            details: `Distance: ${distance.toFixed(0)}km in ${timeDiffMinutes.toFixed(0)}min (${lastLogin.country} to ${newLocation.country})`,
          };
        }
      }

      return { isImpossible: false };
    } catch (error: any) {
      logger.error(`Error detecting impossible travel: ${error.message}`);
      return { isImpossible: false };
    }
  }

  /**
   * Calculate distance between two coordinates (Haversine formula)
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Get location history for user
   */
  getUserLocationHistory(username: string): GeoLocation[] {
    const history = this.userLocationCache.get(username);
    return history ? history.locationHistory : [];
  }

  /**
   * Get last known location for user
   */
  getLastLocation(username: string): GeoLocation | undefined {
    const history = this.userLocationCache.get(username);
    return history?.lastLocation;
  }

  /**
   * Clear old location history (keep only last 30 days)
   */
  private cleanupOldLocations(): void {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    for (const [username, history] of this.userLocationCache.entries()) {
      history.locationHistory = history.locationHistory.filter(
        (loc) => loc.timestamp > thirtyDaysAgo
      );

      if (history.locationHistory.length === 0) {
        this.userLocationCache.delete(username);
      } else {
        this.userLocationCache.set(username, history);
      }
    }

    logger.info('Geolocation history cleanup completed');
  }

  /**
   * Check if geolocation service is enabled
   */
  isGeolocationEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Update API configuration
   */
  setAPIConfig(provider: 'ipapi' | 'ipinfo' | 'maxmind', apiKey?: string): void {
    this.apiProvider = provider;
    this.apiKey = apiKey || null;
    this.isEnabled = true;
    logger.info(`Geolocation provider updated to ${provider}`);
  }
}

export default new GeolocationService();
