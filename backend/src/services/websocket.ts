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

/**
 * Emit notification to specific users or roles
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
      // Check if recipient is a role (e.g., 'super_manager', 'admin', 'super_admin', 'fuel_order_maker')
      if (recipient.includes('_') || recipient === 'admin') {
        // It's a role
        io!.to(`role:${recipient}`).emit('notification', notificationData);
        logger.info(`Notification emitted to role: ${recipient}`);
      } else {
        // It's a specific username or userId
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

export default {
  initializeWebSocket,
  emitNotification,
  emitToAll,
  getConnectedUsersCount,
  isUserConnected,
};
