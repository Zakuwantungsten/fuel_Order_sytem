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
  /** Set of userIds whose sessions have been forcefully terminated by an admin */
  private terminated = new Set<string>();

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

    return active.sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime());
  }

  remove(userId: string): void {
    this.sessions.delete(userId);
  }

  /** Force-terminate a session. The next request from this user will receive 401. */
  terminate(userId: string): void {
    this.sessions.delete(userId);
    this.terminated.add(userId);
    // Auto-clear termination flag after TTL so relogins work normally
    setTimeout(() => this.terminated.delete(userId), SESSION_TTL_MS);
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
    return this.terminated.has(userId);
  }

  get size(): number {
    return this.sessions.size;
  }
}

export const activeSessionTracker = new ActiveSessionTracker();
export default activeSessionTracker;
