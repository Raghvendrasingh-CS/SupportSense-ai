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

// 1. Security & CORS (High Priority)
app.use(helmet({
  contentSecurityPolicy: false, 
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({ 
  origin: true, 
  credentials: true 
}));

app.use(express.json());

// 2. Request Logger for Debugging (Crucial for Railway logs)
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    log(MODULE, `${req.method} ${req.path}`);
  }
  next();
});

// 3. Mount API Routes BEFORE Static Files
// Yeh sabse important hai, taaki static frontend API ko block na kare
app.use('/api', apiRoutes);

// Microsoft 365 Copilot plugin discovery endpoint
app.get('/.well-known/ai-plugin.json', (req, res) => {
  res.sendFile(path.join(__dirname, '../server/ai-plugin.json'));
});

// OpenAPI spec endpoint
app.get('/openapi.json', (req, res) => {
  res.sendFile(path.join(__dirname, '../server/openapi.json'));
});

// 4. Static Assets & Manifests
app.get('/openapi.json', (req, res) => res.sendFile(path.join(__dirname, 'openapi.json')));
app.get(['/ai-plugin.json', '/.well-known/ai-plugin.json'], (req, res) => res.sendFile(path.join(__dirname, 'ai-plugin.json')));

// 5. Socket.io Logic
if (isVercel) {
  app.set('emitFn', (event, data) => log(MODULE, `[Serverless] Suppressed: ${event}`));
} else {
  app.set('emitFn', (event, data) => log(MODULE, `[Init] Event: ${event}`));
}

export default app;

// 6. Railway/Local Bootstrap
if (!isVercel) {
  (async function startServer() {
    try {
      const httpServer = createServer(app);
      const { Server } = await import('socket.io');
      const { setupSocketHandlers, createEmitFn } = await import('./socket/socketHandler.js');

      const io = new Server(httpServer, {
        cors: { origin: "*", methods: ['GET', 'POST'] },
      });

      app.set('emitFn', createEmitFn(io));
      setupSocketHandlers(io);

      // 7. Production React Serving (Last Priority)
      if (process.env.NODE_ENV === 'production') {
        const clientDist = path.join(__dirname, '..', 'client', 'dist');
        app.use(express.static(clientDist));
        
        // SPA Fallback: API ko exclude karke baaki sab index.html par bhej do
        app.get('*', (req, res) => {
          if (!req.path.startsWith('/api')) {
            res.sendFile(path.join(clientDist, 'index.html'));
          }
        });
      }

      const port = process.env.PORT || config.port || 3000;
      httpServer.listen(port, '0.0.0.0', () => {
        log(MODULE, `SupportSense AI live on port ${port}`);
        log(MODULE, `Environment: ${process.env.NODE_ENV}`);
      });

      // Auto-seed demo data if ticket store is empty on startup
if (config.demoMode) {
  try {
    const { seedDemoTickets, getAllTickets } = await import('./pipeline/supportPipeline.js');
    const existing = getAllTickets();
    if (!existing || existing.length === 0) {
      log(MODULE, 'Auto-seeding demo tickets on startup...');
      const tickets = seedDemoTickets();
      const { processBatch } = await import('./pipeline/supportPipeline.js');
      const emitFn = app.get('emitFn');
      await processBatch(tickets, emitFn);
      log(MODULE, `Auto-seed complete: ${tickets.length} tickets processed`);
    }
  } catch (seedError) {
    logError(MODULE, 'Auto-seed failed — continuing without seed data', seedError);
  }
}

      // Error Handlers
      process.on('unhandledRejection', (r) => logError(MODULE, 'Rejection', r));
      process.on('uncaughtException', (e) => {
        logError(MODULE, 'Exception', e);
        if (e.code !== 'EADDRINUSE') process.exit(1);
      });

    } catch (error) {
      logError(MODULE, 'Boot Failure', error);
      process.exit(1);
    }
  })();
}
