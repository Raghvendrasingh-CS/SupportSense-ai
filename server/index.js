// Express + Socket.io server entry point for SupportSense AI backend.
// Dual-mode: exports `app` for Vercel serverless, or starts HTTP listener for local development.
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import { config } from './config/env.js';
import { log, logError } from './utils/logger.js';
import apiRoutes from './routes/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODULE = 'Server';

// Detect Vercel serverless environment
const isVercel = Boolean(process.env.VERCEL);

// ─── Express App Construction ────────────────────────────────────────────────
const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https://ui-avatars.com"],
      connectSrc: ["'self'", "ws:", "wss:", "http://localhost:3000", "http://localhost:3001"],
      fontSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  xFrameOptions: { action: 'deny' },
}));

app.use(cors({ origin: process.env.NODE_ENV === 'production' || isVercel ? true : config.clientUrl }));
app.use(express.json());

// Serve Copilot manifest and OpenAPI spec
app.get('/openapi.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'openapi.json'));
});
app.get(['/ai-plugin.json', '/.well-known/ai-plugin.json'], (req, res) => {
  res.sendFile(path.join(__dirname, 'ai-plugin.json'));
});

// On serverless, Socket.io is unavailable — provide a no-op emitter so pipeline code doesn't crash
if (isVercel) {
  const noopEmit = (event, data) => {
    log(MODULE, `[Serverless] Event suppressed: ${event}`);
  };
  app.set('emitFn', noopEmit);
} else {
  // Only import and initialize Socket.io in non-serverless environments
  app.set('emitFn', (event, data) => {
    log(MODULE, `[Pre-init] Event buffered: ${event}`);
  });
}

// Mount API routes
app.use('/api', apiRoutes);

// ─── Vercel Serverless Export ────────────────────────────────────────────────
// Vercel's @vercel/node runtime imports this file and wraps `app` as a serverless function.
// No `app.listen()` is called — Vercel provides the HTTP layer.
export default app;

// ─── Local Development Server ────────────────────────────────────────────────
// Only starts the HTTP listener + Socket.io when NOT running on Vercel.
if (!isVercel) {
  (async function startServer() {
    try {
      const httpServer = createServer(app);

      // Dynamic import of socket.io to avoid loading it on serverless
      const { Server } = await import('socket.io');
      const { setupSocketHandlers, createEmitFn } = await import('./socket/socketHandler.js');

      const io = new Server(httpServer, {
        cors: {
          origin: process.env.NODE_ENV === 'production' ? true : config.clientUrl,
          methods: ['GET', 'POST'],
        },
      });

      const emitFn = createEmitFn(io);
      app.set('emitFn', emitFn);

      setupSocketHandlers(io);

      // Serve built React app in production
      if (process.env.NODE_ENV === 'production') {
        const clientDist = path.join(__dirname, '..', 'client', 'dist');
        app.use(express.static(clientDist));
        // SPA fallback
        app.get('*', (req, res, next) => {
          if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
          res.sendFile(path.join(clientDist, 'index.html'));
        });
      }

      httpServer.listen(config.port, () => {
        log(MODULE, `SupportSense AI server running on port ${config.port}`);
        log(MODULE, `DEMO_MODE: ${config.demoMode ? 'ENABLED (zero credentials required)' : 'DISABLED (live APIs)'}`);
        log(MODULE, `Agents: TriageAgent, ResolutionAgent, EscalationAgent`);
        log(MODULE, `Client URL: ${config.clientUrl}`);
      });

      function gracefulShutdown(signal) {
        log(MODULE, `${signal} received — shutting down gracefully`);
        
        const shutdownTimeout = setTimeout(() => {
          logError(MODULE, 'Graceful shutdown timed out — forcing exit');
          process.exit(1);
        }, 10000);
        
        io.close(() => {
          log(MODULE, 'Socket.io connections closed');
        });
        
        httpServer.close(() => {
          log(MODULE, 'HTTP server closed');
          clearTimeout(shutdownTimeout);
          process.exit(0);
        });
      }

      process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
      process.on('SIGINT', () => gracefulShutdown('SIGINT'));

      process.on('unhandledRejection', (reason, promise) => {
        logError(MODULE, 'Unhandled Promise Rejection', reason);
      });

      process.on('uncaughtException', (error) => {
        logError(MODULE, 'Uncaught Exception — shutting down', error);
        process.exit(1);
      });

    } catch (error) {
      logError(MODULE, 'Failed to start server', error);
      process.exit(1);
    }
  })();
}
