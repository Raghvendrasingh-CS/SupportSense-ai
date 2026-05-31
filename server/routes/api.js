// REST API routes for tickets, analytics, agents, and pipeline operations.
import { Router } from 'express';
import { log, logError, measureStart, measureEnd } from '../utils/logger.js';
import { config } from '../config/env.js';
import {
  processTicket,
  processBatch,
  getTicket,
  getAllTickets,
  createTicket,
  seedDemoTickets,
} from '../pipeline/supportPipeline.js';
import { checkSLACompliance } from '../agents/EscalationAgent.js';
import { getTicketAnalytics } from '../services/fabricIQ.js';
import { getWorkloadInsights } from '../services/workIQ.js';
import { fetchSupportTickets, getServiceHealth } from '../services/microsoftGraph.js';

const MODULE = 'APIRoutes';
const router = Router();

router.get('/health', (_req, res) => {
  try {
    res.json({
      status: 'healthy',
      demoMode: config.demoMode,
      timestamp: new Date().toISOString(),
      agents: ['TriageAgent', 'ResolutionAgent', 'EscalationAgent'],
    });
  } catch (error) {
    logError(MODULE, 'health check failed', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/config', (_req, res) => {
  try {
    res.json({
      demoMode: config.demoMode,
      port: config.port,
      integrations: {
        microsoftGraph: config.demoMode ? 'mock' : 'live',
        fabricIQ: config.demoMode ? 'mock' : 'live',
        workIQ: config.demoMode ? 'mock' : 'live',
      },
      processingTimeMs: 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logError(MODULE, 'config fetch failed', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/tickets', async (_req, res) => {
  const startMs = measureStart();
  try {
    log(MODULE, 'GET /tickets');
    const localTickets = getAllTickets();
    const { tickets: graphTickets, source } = await fetchSupportTickets();

    const merged = localTickets.length > 0 ? localTickets : graphTickets.map((t) => ({
      ...t,
      createdAt: t.createdDateTime,
    }));

    res.json({
      tickets: merged,
      count: merged.length,
      source: localTickets.length > 0 ? 'pipeline' : source,
      processingTimeMs: measureEnd(startMs),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logError(MODULE, 'GET /tickets failed', error);
    res.status(500).json({ error: error.message, processingTimeMs: measureEnd(startMs) });
  }
});

router.get('/tickets/:id', (req, res) => {
  const startMs = measureStart();
  try {
    const ticket = getTicket(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found', processingTimeMs: measureEnd(startMs) });
    }
    res.json({ ticket, processingTimeMs: measureEnd(startMs), timestamp: new Date().toISOString() });
  } catch (error) {
    logError(MODULE, 'GET /tickets/:id failed', error);
    res.status(500).json({ error: error.message, processingTimeMs: measureEnd(startMs) });
  }
});

router.post('/tickets', async (req, res) => {
  const startMs = measureStart();
  try {
    log(MODULE, 'POST /tickets — creating and processing ticket');
    const { subject, description, requesterId } = req.body;

    if (!subject) {
      return res.status(400).json({ error: 'Subject is required', processingTimeMs: measureEnd(startMs) });
    }

    const ticket = createTicket({ subject, description, requesterId });
    const emitFn = req.app.get('emitFn');
    const result = await processTicket(ticket, emitFn);

    res.status(201).json({
      ...result,
      processingTimeMs: measureEnd(startMs),
    });
  } catch (error) {
    logError(MODULE, 'POST /tickets failed', error);
    res.status(500).json({ error: error.message, processingTimeMs: measureEnd(startMs) });
  }
});

router.post('/tickets/:id/process', async (req, res) => {
  const startMs = measureStart();
  try {
    log(MODULE, `POST /tickets/${req.params.id}/process`);
    const emitFn = req.app.get('emitFn');
    const result = await processTicket(req.params.id, emitFn);
    res.json({ ...result, processingTimeMs: measureEnd(startMs) });
  } catch (error) {
    logError(MODULE, 'POST /tickets/:id/process failed', error);
    res.status(500).json({ error: error.message, processingTimeMs: measureEnd(startMs) });
  }
});

router.post('/pipeline/batch', async (req, res) => {
  const startMs = measureStart();
  try {
    log(MODULE, 'POST /pipeline/batch');
    const tickets = req.body.tickets || seedDemoTickets();
    const emitFn = req.app.get('emitFn');
    const result = await processBatch(tickets, emitFn);
    res.json({ ...result, processingTimeMs: measureEnd(startMs) });
  } catch (error) {
    logError(MODULE, 'POST /pipeline/batch failed', error);
    res.status(500).json({ error: error.message, processingTimeMs: measureEnd(startMs) });
  }
});

router.post('/demo/seed', async (req, res) => {
  const startMs = measureStart();
  try {
    log(MODULE, 'POST /demo/seed — seeding and processing demo tickets');
    const demos = seedDemoTickets();
    const emitFn = req.app.get('emitFn');
    const result = await processBatch(demos, emitFn);
    res.json({ ...result, processingTimeMs: measureEnd(startMs) });
  } catch (error) {
    logError(MODULE, 'POST /demo/seed failed', error);
    res.status(500).json({ error: error.message, processingTimeMs: measureEnd(startMs) });
  }
});

router.get('/analytics', async (_req, res) => {
  const startMs = measureStart();
  try {
    log(MODULE, 'GET /analytics');
    const { analytics, source } = await getTicketAnalytics();
    res.json({ analytics, source, processingTimeMs: measureEnd(startMs), timestamp: new Date().toISOString() });
  } catch (error) {
    logError(MODULE, 'GET /analytics failed', error);
    res.status(500).json({ error: error.message, processingTimeMs: measureEnd(startMs) });
  }
});

router.get('/agents/workload', async (_req, res) => {
  const startMs = measureStart();
  try {
    log(MODULE, 'GET /agents/workload');
    const { insights, source } = await getWorkloadInsights();
    res.json({ insights, source, processingTimeMs: measureEnd(startMs), timestamp: new Date().toISOString() });
  } catch (error) {
    logError(MODULE, 'GET /agents/workload failed', error);
    res.status(500).json({ error: error.message, processingTimeMs: measureEnd(startMs) });
  }
});

router.get('/sla', async (_req, res) => {
  const startMs = measureStart();
  try {
    log(MODULE, 'GET /sla');
    const tickets = getAllTickets();
    const slaReport = await checkSLACompliance(tickets);
    res.json({ ...slaReport, processingTimeMs: measureEnd(startMs) });
  } catch (error) {
    logError(MODULE, 'GET /sla failed', error);
    res.status(500).json({ error: error.message, processingTimeMs: measureEnd(startMs) });
  }
});

router.get('/services/health', async (_req, res) => {
  const startMs = measureStart();
  try {
    log(MODULE, 'GET /services/health');
    const health = await getServiceHealth();
    res.json({ ...health, processingTimeMs: measureEnd(startMs) });
  } catch (error) {
    logError(MODULE, 'GET /services/health failed', error);
    res.status(500).json({ error: error.message, processingTimeMs: measureEnd(startMs) });
  }
});

export default router;
