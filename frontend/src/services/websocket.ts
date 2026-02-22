import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// ----- Stable module-level callbacks -----
// These are set by subscribe* functions and read by listeners registered
// once inside initializeWebSocket. This means react re-renders, effect
// cleanups, and react strict-mode double-invocations can never accidentally
// remove the underlying socket.on listener.
let _sessionEventCallback: ((event: any) => void) | null = null;
let _maintenanceEventCallback: ((event: any) => void) | null = null;
let _settingsEventCallback: ((event: any) => void) | null = null;
let _securityEventCallback: ((event: any) => void) | null = null;

/**
 * Initialize WebSocket connection
 */
export const initializeWebSocket = (token: string): Socket => {
  // Use actual backend URL for WebSocket (not the proxy)
  const WS_URL = 'http://localhost:5000';

  if (socket?.connected) {
    console.log('[WebSocket] Already connected');
    return socket;
  }

  console.log('[WebSocket] Initializing connection to:', WS_URL);

  socket = io(WS_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
  });

  // Register stable application-event listeners once per socket instance.
  // Routing through module-level callbacks means the subscriber (React component)
  // can be swapped without ever touching socket.on / socket.off again.
  socket.on('session_event', (event) => {
    console.log('[WebSocket] Received session event:', event);
    if (_sessionEventCallback) _sessionEventCallback(event);
  });
  socket.on('maintenance_event', (event) => {
    console.log('[WebSocket] Received maintenance event:', event);
    if (_maintenanceEventCallback) _maintenanceEventCallback(event);
  });
  socket.on('settings_event', (event) => {
    console.log('[WebSocket] Received settings event:', event);
    if (_settingsEventCallback) _settingsEventCallback(event);
  });
  socket.on('security_event', (event) => {
    console.log('[WebSocket] Received security event:', event);
    if (_securityEventCallback) _securityEventCallback(event);
  });

  socket.on('connect', () => {
    console.log('[WebSocket] Connected - Socket ID:', socket?.id);
    reconnectAttempts = 0;
  });

  socket.on('connected', (data) => {
    console.log('[WebSocket] Server acknowledgment:', data);
  });

  socket.on('disconnect', (reason) => {
    console.log('[WebSocket] Disconnected:', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('[WebSocket] Connection error:', error.message);
    reconnectAttempts++;
    
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('[WebSocket] Max reconnection attempts reached');
      socket?.disconnect();
    }
  });

  socket.on('reconnect', (attemptNumber) => {
    console.log('[WebSocket] Reconnected after', attemptNumber, 'attempts');
  });

  socket.on('reconnect_attempt', (attemptNumber) => {
    console.log('[WebSocket] Reconnection attempt:', attemptNumber);
  });

  socket.on('reconnect_failed', () => {
    console.error('[WebSocket] Reconnection failed');
  });

  return socket;
};

/**
 * Subscribe to notification events
 */
export const subscribeToNotifications = (callback: (notification: any) => void): void => {
  if (!socket) {
    console.error('[WebSocket] Socket not initialized');
    return;
  }

  socket.on('notification', (notification) => {
    console.log('[WebSocket] Received notification:', notification);
    callback(notification);
  });
};

/**
 * Unsubscribe from notification events
 */
export const unsubscribeFromNotifications = (): void => {
  if (!socket) return;
  socket.off('notification');
};

/**
 * Subscribe to session management events (force logout, deactivation, ban, etc.)
 * Sets the module-level callback — the socket listener is already registered in
 * initializeWebSocket and will call this callback whenever an event arrives.
 */
export const subscribeToSessionEvents = (callback: (event: any) => void): void => {
  _sessionEventCallback = callback;
};

/**
 * Unsubscribe from session management events
 */
export const unsubscribeFromSessionEvents = (): void => {
  _sessionEventCallback = null;
};

/**
 * Subscribe to system-wide maintenance mode events.
 * Emitted by the server whenever an admin enables or disables maintenance mode.
 * The callback receives { enabled, message, allowedRoles }.
 */
export const subscribeToMaintenanceEvents = (callback: (event: any) => void): void => {
  _maintenanceEventCallback = callback;
};

/**
 * Unsubscribe from maintenance mode events
 */
export const unsubscribeFromMaintenanceEvents = (): void => {
  _maintenanceEventCallback = null;
};

/**
 * Subscribe to general settings change events.
 * Emitted whenever a super_admin saves General Settings (system name, timezone,
 * date format, language). The callback receives { systemName, timezone, dateFormat, language }.
 * All open tabs across all users apply the changes immediately without a refresh.
 */
export const subscribeToSettingsEvents = (callback: (event: any) => void): void => {
  _settingsEventCallback = callback;
};

/**
 * Unsubscribe from general settings events
 */
export const unsubscribeFromSettingsEvents = (): void => {
  _settingsEventCallback = null;
};

/**
 * Subscribe to security & session settings change events.
 * Emitted to the super_admin role room whenever session or password policy is saved.
 * The callback receives { session?, password? }.
 */
export const subscribeToSecurityEvents = (callback: (event: any) => void): void => {
  _securityEventCallback = callback;
};

/**
 * Unsubscribe from security settings events
 */
export const unsubscribeFromSecurityEvents = (): void => {
  _securityEventCallback = null;
};

/**
 * Disconnect WebSocket
 */
export const disconnectWebSocket = (): void => {
  if (socket) {
    console.log('[WebSocket] Disconnecting...');
    socket.disconnect();
    socket = null;
  }
};

/**
 * Check if WebSocket is connected
 */
export const isConnected = (): boolean => {
  return socket?.connected || false;
};

/**
 * Get current socket instance
 */
export const getSocket = (): Socket | null => {
  return socket;
};

export default {
  initializeWebSocket,
  subscribeToNotifications,
  unsubscribeFromNotifications,
  subscribeToSessionEvents,
  unsubscribeFromSessionEvents,
  subscribeToMaintenanceEvents,
  unsubscribeFromMaintenanceEvents,
  subscribeToSettingsEvents,
  unsubscribeFromSettingsEvents,
  subscribeToSecurityEvents,
  unsubscribeFromSecurityEvents,
  disconnectWebSocket,
  isConnected,
  getSocket,
};
