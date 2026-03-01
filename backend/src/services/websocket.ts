import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import logger from '../utils/logger';

let io: SocketIOServer | null = null;

// Store connected users by role and userId for targeted notifications
const connectedUsers = new Map<string, Set<string>>(); // userId -> Set of socket IDs

interface AuthSocket extends Socket {
  userId?: string;
  username?: string;
  role?: string;
}

interface ClientEventGuard {
  roles: string[];
  validate?: (payload: unknown) => boolean;
}

const clientEventGuards: Record<string, ClientEventGuard> = {
  // Add client-emitted events here with role and payload validation.
  // Example:
  // 'truck:position:update': {
  //   roles: ['driver', 'admin'],
  //   validate: (payload) => typeof payload === 'object' && payload !== null,
  // },
};

/**
 * Initialize WebSocket server
 */
export const initializeWebSocket = (server: HTTPServer): SocketIOServer => {
  io = new SocketIOServer(server, {
    cors: {
      origin: config.corsOrigin || '*',
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Authentication middleware
  io.use((socket: AuthSocket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      logger.warn('WebSocket connection attempt without token');
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, config.jwtSecret) as any;
      socket.userId = decoded.userId;
      socket.username = decoded.username;
      socket.role = decoded.role;
      next();
    } catch (error) {
      logger.error('WebSocket authentication failed:', error);
      return next(new Error('Invalid token'));
    }
  });

  // Connection handler
  io.on('connection', (socket: AuthSocket) => {
    logger.info(`WebSocket client connected: ${socket.username} (${socket.role}) - Socket ID: ${socket.id}`);

    socket.use((packet, next) => {
      const eventName = packet[0];
      const payload = packet[1];

      const guard = clientEventGuards[eventName];
      if (!guard) {
        logger.warn(`Blocked unregistered socket event: ${eventName}`, {
          user: socket.username,
          role: socket.role,
          socketId: socket.id,
        });
        return next(new Error('Event not allowed'));
      }

      if (guard.roles.length > 0 && (!socket.role || !guard.roles.includes(socket.role))) {
        logger.warn(`Blocked unauthorized socket event: ${eventName}`, {
          user: socket.username,
          role: socket.role,
          socketId: socket.id,
        });
        return next(new Error('Not authorized'));
      }

      if (guard.validate && !guard.validate(payload)) {
        logger.warn(`Blocked invalid socket payload: ${eventName}`, {
          user: socket.username,
          role: socket.role,
          socketId: socket.id,
        });
        return next(new Error('Invalid payload'));
      }

      return next();
    });

    // Track connected user
    if (socket.userId) {
      if (!connectedUsers.has(socket.userId)) {
        connectedUsers.set(socket.userId, new Set());
      }
      connectedUsers.get(socket.userId)!.add(socket.id);
    }

    // Join room based on role (for role-based notifications)
    if (socket.role) {
      socket.join(`role:${socket.role}`);
      logger.info(`User ${socket.username} joined role room: role:${socket.role}`);
    }

    // Join room based on username (for specific user notifications)
    if (socket.username) {
      socket.join(`user:${socket.username}`);
      logger.info(`User ${socket.username} joined user room: user:${socket.username}`);
    }

    // Join room based on userId (for direct user notifications keyed by MongoDB ObjectId)
    // emitNotification() stores creatorUserId (ObjectId string) as recipient for personal notifications
    if (socket.userId) {
      socket.join(`user:${socket.userId}`);
      logger.info(`User ${socket.username} joined userId room: user:${socket.userId}`);
    }

    // Handle disconnection
    socket.on('disconnect', () => {
      logger.info(`WebSocket client disconnected: ${socket.username} - Socket ID: ${socket.id}`);
      
      // Remove from connected users
      if (socket.userId && connectedUsers.has(socket.userId)) {
        connectedUsers.get(socket.userId)!.delete(socket.id);
        if (connectedUsers.get(socket.userId)!.size === 0) {
          connectedUsers.delete(socket.userId);
        }
      }
    });

    // Send connection acknowledgment
    socket.emit('connected', {
      message: 'Connected to notification server',
      userId: socket.userId,
      username: socket.username,
      role: socket.role,
    });
  });

  logger.info('WebSocket server initialized');
  return io;
};

// Explicit set of known role names so ObjectIds / usernames are never mis-routed
const ROLE_NAMES = new Set([
  'super_admin', 'admin', 'manager', 'super_manager', 'supervisor', 'boss',
  'clerk', 'fuel_order_maker', 'driver', 'officer', 'accountant',
  'dar_yard', 'msa_yard', 'tanga_yard',
]);

/**
 * Emit notification to specific users or roles.
 * Recipients are either a known role name OR a userId / username (→ user room).
 * MongoDB ObjectIds (24-char hex) and usernames always go to user rooms.
 */
export const emitNotification = (
  recipients: string[],
  notificationData: any
): void => {
  if (!io) {
    logger.error('WebSocket server not initialized');
    return;
  }

  try {
    recipients.forEach((recipient) => {
      if (ROLE_NAMES.has(recipient)) {
        io!.to(`role:${recipient}`).emit('notification', notificationData);
        logger.info(`Notification emitted to role: ${recipient}`);
      } else {
        // userId (MongoDB ObjectId) or username → user room
        io!.to(`user:${recipient}`).emit('notification', notificationData);
        logger.info(`Notification emitted to user: ${recipient}`);
      }
    });
  } catch (error) {
    logger.error('Error emitting notification:', error);
  }
};

/**
 * Emit notification to all connected clients
 */
export const emitToAll = (event: string, data: any): void => {
  if (!io) {
    logger.error('WebSocket server not initialized');
    return;
  }

  io.emit(event, data);
  logger.info(`Event '${event}' emitted to all clients`);
};

/**
 * Get connected users count
 */
export const getConnectedUsersCount = (): number => {
  return connectedUsers.size;
};

/**
 * Check if user is connected
 */
export const isUserConnected = (userId: string): boolean => {
  return connectedUsers.has(userId) && connectedUsers.get(userId)!.size > 0;
};

/**
 * Emit a targeted event directly to a specific user by username.
 * Used for session management events (force logout, deactivation, bans, etc.)
 */
export const emitToUser = (username: string, event: string, data: any): void => {
  if (!io) {
    logger.warn(`WebSocket server not initialized – cannot emit '${event}' to user: ${username}`);
    return;
  }
  io.to(`user:${username}`).emit(event, data);
  logger.info(`Event '${event}' emitted to user: ${username}`);
};

/**
 * Broadcast a maintenance mode change to all connected clients.
 * The frontend uses 'enabled' and the client's own role to decide
 * whether to show a full blocking maintenance page or just an info banner.
 */
export const emitMaintenanceEvent = (
  enabled: boolean,
  message: string,
  allowedRoles: string[] = ['super_admin']
): void => {
  if (!io) {
    logger.warn('WebSocket server not initialized – cannot emit maintenance event');
    return;
  }
  io.emit('maintenance_event', { enabled, message, allowedRoles });
  logger.info(`Maintenance event broadcasted: ${enabled ? 'ENABLED' : 'DISABLED'}`);
};

/**
 * Broadcast a general settings change to all connected clients so every open
 * tab (across all users and roles) picks up the new system name, timezone, and
 * date format immediately without needing a page refresh.
 */
export const emitGeneralSettingsEvent = (settings: {
  systemName: string;
  timezone: string;
  dateFormat: string;
  language: string;
}): void => {
  if (!io) {
    logger.warn('WebSocket server not initialized – cannot emit settings event');
    return;
  }
  io.emit('settings_event', settings);
  logger.info(`General settings event broadcasted: systemName=${settings.systemName}, timezone=${settings.timezone}`);
};

/**
 * Broadcast security & session settings changes to all super_admin sockets.
 * Only super_admins have access to these settings, so we emit to their role room
 * rather than to every connected client.
 */
export const emitSecuritySettingsEvent = (settings: {
  session?: {
    sessionTimeout: number;
    jwtExpiry: number;
    refreshTokenExpiry: number;
    maxLoginAttempts: number;
    lockoutDuration: number;
    allowMultipleSessions: boolean;
  };
  password?: {
    minLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
    historyCount: number;
  };
  mfa?: {
    globalEnabled: boolean;
    requiredRoles: string[];
  };
}): void => {
  if (!io) {
    logger.warn('WebSocket server not initialized – cannot emit security settings event');
    return;
  }
  io.to('role:super_admin').emit('security_event', settings);
  logger.info('Security settings event broadcasted to super_admin role');
};

/**
 * Broadcast a data change event to all connected clients.
 * Used for real-time cache invalidation — when any user creates/updates/deletes
 * data, all other connected clients viewing that collection will silently re-fetch.
 */
export const emitDataChange = (
  collection: string,
  action: 'create' | 'update' | 'delete' = 'update'
): void => {
  if (!io) return;
  io.emit('data_changed', { collection, action, timestamp: Date.now() });
};

export default {
  initializeWebSocket,
  emitNotification,
  emitToAll,
  emitDataChange,
  getConnectedUsersCount,
  isUserConnected,
  emitToUser,
  emitMaintenanceEvent,
  emitGeneralSettingsEvent,
  emitSecuritySettingsEvent,
};
