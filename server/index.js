// Express + Socket.io server entry point for SupportSense AI backend.
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

const isVercel = Boolean(process.env.VERCEL);
const app = express();

// ─── Security Layer (Optimized for Railway/Production) ──────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Relaxed for hackathon demo to avoid chart/socket blocking
  crossOriginEmbedderPolicy: false,
}));

// ─── CORS Configuration ──────────────────────────────────────────────────────
app.use(cors({ 
  origin: true, // Allows all origins in production to prevent handshake errors
  credentials: true 
}));
app.use(express.json());

// ─── Static Assets ───────────────────────────────────────────────────────────
app.get('/openapi.json', (req, res) => res.sendFile(path.join(__dirname, 'openapi.json')));
app.get(['/ai-plugin.json', '/.well-known/ai-plugin.json'], (req, res) => res.sendFile(path.join(__dirname, 'ai-plugin.json')));

// ─── Socket.io Emitter Setup ─────────────────────────────────────────────────
if (isVercel) {
  app.set('emitFn', (event, data) => log(MODULE, `[Serverless] Suppressed: ${event}`));
} else {
  // Default fallback until server fully starts
  app.set('emitFn', (event, data) => log(MODULE, `[Init] Event: ${event}`));
}

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api', apiRoutes);

// ─── Vercel Export ───────────────────────────────────────────────────────────
export default app;

// ─── Railway/Local Server Start ──────────────────────────────────────────────
if (!isVercel) {
  (async function startServer() {
    try {
      const httpServer = createServer(app);

      // Dynamic import to prevent serverless issues
      const { Server } = await import('socket.io');
      const { setupSocketHandlers, createEmitFn } = await import('./socket/socketHandler.js');

      const io = new Server(httpServer, {
        cors: {
          origin: "*", // Critical for Railway production
          methods: ['GET', 'POST'],
        },
      });

      const emitFn = createEmitFn(io);
      app.set('emitFn', emitFn);
      setupSocketHandlers(io);

      // ─── Production React Serving ──────────────────────────────────────────
      if (process.env.NODE_ENV === 'production') {
        const clientDist = path.join(__dirname, '..', 'client', 'dist');
        app.use(express.static(clientDist));
        app.get('*', (req, res, next) => {
          if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
          res.sendFile(path.join(clientDist, 'index.html'));
        });
      }

      httpServer.listen(config.port, '0.0.0.0', () => { // Explicitly listen on all interfaces
        log(MODULE, `SupportSense AI live on port ${config.port}`);
      });

      // ─── Error Handling ────────────────────────────────────────────────────
      process.on('unhandledRejection', (reason) => logError(MODULE, 'Unhandled Rejection', reason));
      process.on('uncaughtException', (error) => {
        logError(MODULE, 'Uncaught Exception', error);
        if (error.code !== 'EADDRINUSE') process.exit(1);
      });

    } catch (error) {
      logError(MODULE, 'Critical Boot Failure', error);
      process.exit(1);
    }
  })();
}
