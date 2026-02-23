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

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes of inactivity = session ends

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

  /**
   * Record (or refresh) a user session. Call this after every successful
   * authentication inside the authenticate() middleware.
   */
  touch(userId: string, username: string, role: string, ip: string): void {
    const existing = this.sessions.get(userId);
    if (existing) {
      existing.lastSeen = new Date();
      existing.requestCount++;
      existing.ip = ip; // update in case they reconnected from a different IP
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

  /**
   * Return all sessions that are still within the TTL window.
   * Expired sessions are pruned on read.
   */
  getActive(): ActiveSession[] {
    const now = Date.now();
    const active: ActiveSession[] = [];

    for (const [userId, session] of this.sessions) {
      if (now - session.lastSeen.getTime() > SESSION_TTL_MS) {
        this.sessions.delete(userId);
      } else {
        active.push(session);
      }
    }

    // Most recently active first
    return active.sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime());
  }

  /**
   * Explicitly remove a user session (e.g. on logout).
   */
  remove(userId: string): void {
    this.sessions.delete(userId);
  }

  /** Total number of currently tracked sessions (before TTL pruning). */
  get size(): number {
    return this.sessions.size;
  }
}

export const activeSessionTracker = new ActiveSessionTracker();
export default activeSessionTracker;
