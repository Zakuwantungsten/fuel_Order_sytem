import { SystemConfig } from '../models';

/**
 * Active Session Tracker
 *
 * Tracks authenticated API users in memory so the super-admin dashboard can
 * display who is currently active — without relying on MongoDB admin commands
 * that are restricted on Atlas shared tiers.
 *
 * A session is considered "active" if the user made at least one authenticated
 * request within the last SESSION_TTL_MS milliseconds.
 */

const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000; // fallback: 30 minutes
let sessionTtlMs = DEFAULT_SESSION_TTL_MS;
let lastConfigLoad = 0;
const CONFIG_CACHE_TTL = 60_000; // re-read config at most every 60 s

async function loadSessionTtl(): Promise<number> {
  const now = Date.now();
  if (now - lastConfigLoad < CONFIG_CACHE_TTL) return sessionTtlMs;
  try {
    const config = await SystemConfig.findOne({ configType: 'system_settings' }).lean();
    const timeout = (config as any)?.systemSettings?.session?.sessionTimeout;
    if (typeof timeout === 'number' && timeout > 0) {
      sessionTtlMs = timeout * 60 * 1000; // stored in minutes, convert to ms
    }
    lastConfigLoad = now;
  } catch {
    // keep current value on error
  }
  return sessionTtlMs;
}

export interface ActiveSession {
  userId: string;
  username: string;
  role: string;
  ip: string;
  firstSeen: Date;
  lastSeen: Date;
  requestCount: number;
}

class ActiveSessionTracker {
  private sessions = new Map<string, ActiveSession>();
  /** userId → absolute expiry timestamp (ms). No timers — checked lazily on access. */
  private terminated = new Map<string, number>();

  touch(userId: string, username: string, role: string, ip: string): void {
    const existing = this.sessions.get(userId);
    if (existing) {
      existing.lastSeen = new Date();
      existing.requestCount++;
      existing.ip = ip;
    } else {
      this.sessions.set(userId, {
        userId,
        username,
        role,
        ip,
        firstSeen: new Date(),
        lastSeen: new Date(),
        requestCount: 1,
      });
    }
  }

  async getActive(): Promise<ActiveSession[]> {
    const ttl = await loadSessionTtl();
    const now = Date.now();
    const active: ActiveSession[] = [];

    for (const [userId, session] of this.sessions) {
      if (now - session.lastSeen.getTime() > ttl) {
        this.sessions.delete(userId);
      } else {
        active.push(session);
      }
    }

    return active.sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime());
  }

  remove(userId: string): void {
    this.sessions.delete(userId);
  }

  /** Force-terminate a session. The next request from this user will receive 401. */
  terminate(userId: string): void {
    this.sessions.delete(userId);
    // Store expiry as an absolute timestamp — no timer created, checked lazily in isTerminated().
    this.terminated.set(userId, Date.now() + sessionTtlMs);
  }

  /** Terminate ALL active sessions except the specified userId */
  terminateAll(exceptUserId?: string): string[] {
    const ids: string[] = [];
    for (const [userId] of this.sessions) {
      if (userId !== exceptUserId) {
        this.terminate(userId);
        ids.push(userId);
      }
    }
    return ids;
  }

  /** Returns true if this session was explicitly terminated by an admin */
  isTerminated(userId: string): boolean {
    const expiresAt = this.terminated.get(userId);
    if (expiresAt === undefined) return false;
    if (Date.now() > expiresAt) {
      this.terminated.delete(userId); // lazy cleanup — no accumulation
      return false;
    }
    return true;
  }

  get size(): number {
    return this.sessions.size;
  }
}

export const activeSessionTracker = new ActiveSessionTracker();
export default activeSessionTracker;
