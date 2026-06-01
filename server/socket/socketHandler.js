// Socket.io event handler — broadcasts all pipeline state changes to connected clients.
import { log, logError } from '../utils/logger.js';
import { config } from '../config/env.js';

const MODULE = 'SocketHandler';

export function setupSocketHandlers(io) {
  try {
    log(MODULE, 'Initializing Socket.io handlers');

    io.use((socket, next) => {
      if (config.demoMode) return next();

      const token = socket.handshake.auth?.token;
      const validToken = process.env.SOCKET_API_KEY || process.env.DEMO_API_KEY || 'demo-key';

      if (!token) {
        log(MODULE, `Connection rejected for ${socket.id}: No token provided`);
        return next(new Error('Authentication required: no token provided'));
      }
      if (token !== validToken) {
        log(MODULE, `Connection rejected for ${socket.id}: Invalid token`);
        return next(new Error('Authentication failed: invalid token'));
      }
      next();
    });

    io.on('connection', (socket) => {
      log(MODULE, `Client connected: ${socket.id}`);

      socket.emit('connection:established', {
        socketId: socket.id,
        timestamp: new Date().toISOString(),
        message: 'Connected to SupportSense AI',
      });

      socket.on('subscribe:ticket', (ticketId) => {
        try {
          log(MODULE, `Client ${socket.id} subscribed to ticket ${ticketId}`);
          socket.join(`ticket:${ticketId}`);
          socket.emit('subscription:confirmed', { ticketId, timestamp: new Date().toISOString() });
        } catch (error) {
          logError(MODULE, 'subscribe:ticket failed', error);
        }
      });

      socket.on('unsubscribe:ticket', (ticketId) => {
        try {
          log(MODULE, `Client ${socket.id} unsubscribed from ticket ${ticketId}`);
          socket.leave(`ticket:${ticketId}`);
        } catch (error) {
          logError(MODULE, 'unsubscribe:ticket failed', error);
        }
      });

      socket.on('ping', () => {
        socket.emit('pong', { timestamp: new Date().toISOString() });
      });

      socket.on('disconnect', (reason) => {
        log(MODULE, `Client disconnected: ${socket.id} (${reason})`);
      });
    });

    log(MODULE, 'Socket.io handlers ready');
  } catch (error) {
    logError(MODULE, 'setupSocketHandlers failed', error);
  }
}

export function createEmitFn(io) {
  return (event, data) => {
    try {
      log(MODULE, `Emitting event: ${event}`, { ticketId: data?.ticketId });
      io.emit(event, { ...data, eventTimestamp: new Date().toISOString() });

      if (data?.ticketId) {
        io.to(`ticket:${data.ticketId}`).emit(event, { ...data, eventTimestamp: new Date().toISOString() });
      }
    } catch (error) {
      logError(MODULE, `Failed to emit ${event}`, error);
    }
  };
}
