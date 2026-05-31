// Express + Socket.io server entry point for SupportSense AI backend.
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { config } from './config/env.js';
import { log, logError } from './utils/logger.js';
import apiRoutes from './routes/api.js';
import { setupSocketHandlers, createEmitFn } from './socket/socketHandler.js';

const MODULE = 'Server';

async function startServer() {
  try {
    const app = express();
    const httpServer = createServer(app);

    const io = new Server(httpServer, {
      cors: {
        origin: config.clientUrl,
        methods: ['GET', 'POST'],
      },
    });

    const emitFn = createEmitFn(io);
    app.set('emitFn', emitFn);

    app.use(cors({ origin: config.clientUrl }));
    app.use(express.json());

    app.use('/api', apiRoutes);

    setupSocketHandlers(io);

    httpServer.listen(config.port, () => {
      log(MODULE, `SupportSense AI server running on port ${config.port}`);
      log(MODULE, `DEMO_MODE: ${config.demoMode ? 'ENABLED (zero credentials required)' : 'DISABLED (live APIs)'}`);
      log(MODULE, `Agents: TriageAgent, ResolutionAgent, EscalationAgent`);
      log(MODULE, `Client URL: ${config.clientUrl}`);
    });
  } catch (error) {
    logError(MODULE, 'Failed to start server', error);
    process.exit(1);
  }
}

startServer();
