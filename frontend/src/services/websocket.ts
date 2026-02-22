import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

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
 * These are emitted directly by the server when an admin performs an action on this user.
 */
export const subscribeToSessionEvents = (callback: (event: any) => void): void => {
  if (!socket) {
    console.error('[WebSocket] Socket not initialized for session events');
    return;
  }
  socket.on('session_event', (event) => {
    console.log('[WebSocket] Received session event:', event);
    callback(event);
  });
};

/**
 * Unsubscribe from session management events
 */
export const unsubscribeFromSessionEvents = (): void => {
  if (!socket) return;
  socket.off('session_event');
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
  disconnectWebSocket,
  isConnected,
  getSocket,
};
