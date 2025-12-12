/**
 * Activity Tracker Utility
 * Monitors user activity and triggers auto-logout after 30 minutes of inactivity
 */

type ActivityCallback = () => void;

const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds

class ActivityTracker {
  private timeout: NodeJS.Timeout | null = null;
  private onInactivityCallback: ActivityCallback | null = null;
  private isTracking = false;

  // Events that indicate user activity
  private activityEvents = [
    'mousedown',
    'mousemove',
    'keypress',
    'scroll',
    'touchstart',
    'click',
  ];

  /**
   * Start tracking user activity
   */
  start(onInactivity: ActivityCallback): void {
    if (this.isTracking) {
      this.stop(); // Clean up existing listeners
    }

    this.onInactivityCallback = onInactivity;
    this.isTracking = true;

    // Add event listeners for user activity
    this.activityEvents.forEach((event) => {
      window.addEventListener(event, this.handleActivity, true);
    });

    // Start the initial timeout
    this.resetTimeout();
  }

  /**
   * Stop tracking user activity
   */
  stop(): void {
    if (!this.isTracking) return;

    this.isTracking = false;

    // Remove all event listeners
    this.activityEvents.forEach((event) => {
      window.removeEventListener(event, this.handleActivity, true);
    });

    // Clear the timeout
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }

    this.onInactivityCallback = null;
  }

  /**
   * Handle user activity - reset the inactivity timer
   */
  private handleActivity = (): void => {
    this.resetTimeout();
  };

  /**
   * Reset the inactivity timeout
   */
  private resetTimeout(): void {
    // Clear existing timeout
    if (this.timeout) {
      clearTimeout(this.timeout);
    }

    // Set new timeout
    this.timeout = setTimeout(() => {
      if (this.onInactivityCallback && this.isTracking) {
        this.onInactivityCallback();
      }
    }, INACTIVITY_TIMEOUT);
  }

  /**
   * Check if tracker is currently active
   */
  isActive(): boolean {
    return this.isTracking;
  }
}

// Export singleton instance
export const activityTracker = new ActivityTracker();
