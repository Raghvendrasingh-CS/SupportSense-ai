// REST API routes for tickets, analytics, agents, and pipeline operations.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { log, logError, measureStart, measureEnd } from '../utils/logger.js';
import { config, getIntegrationStatus } from '../config/env.js';
import {
  processTicket,
  processBatch,
  getTicket,
  getAllTickets,
  createTicket,
  seedDemoTickets,
  getCustomerHistory,
  getCustomerRiskProfile,
  saveTicket,
} from '../pipeline/supportPipeline.js';
import { checkSLACompliance } from '../agents/EscalationAgent.js';
import { getTicketAnalytics } from '../services/fabricIQ.js';
import { getWorkloadInsights } from '../services/workIQ.js';
import { fetchSupportTickets, getServiceHealth } from '../services/microsoftGraph.js';
import { validateTicket } from '../middleware/validate.js';
import { checkApiKey, checkRole } from '../middleware/auth.js';
import { getAuditLogs, getAuditLogByTicket } from '../utils/auditLogger.js';
import analyticsRoutes from './analytics.js';

const MODULE = 'APIRoutes';
const router = Router();

router.use('/analytics', analyticsRoutes);

const postLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many requests, please try again after a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

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
      integrations: getIntegrationStatus(),
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

router.get('/tickets/history', (req, res) => {
  const startMs = measureStart();
  try {
    log(MODULE, 'GET /tickets/history');
    const allTickets = getAllTickets();
    const processed = allTickets.filter((t) => t.pipeline !== null);
    res.json({
      tickets: processed,
      count: processed.length,
      processingTimeMs: measureEnd(startMs),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logError(MODULE, 'GET /tickets/history failed', error);
    res.status(500).json({ error: error.message, processingTimeMs: measureEnd(startMs) });
  }
});

router.get('/customers/history', (req, res) => {
  const startMs = measureStart();
  try {
    const email = req.query.email;
    log(MODULE, `GET /customers/history for ${email}`);
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid "email" query parameter.', processingTimeMs: measureEnd(startMs) });
    }
    const history = getCustomerHistory(email);
    const riskProfile = getCustomerRiskProfile(email);
    res.json({
      email,
      history,
      riskProfile,
      processingTimeMs: measureEnd(startMs),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logError(MODULE, 'GET /customers/history failed', error);
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

router.patch('/tickets/:id', checkApiKey, async (req, res) => {
  const startMs = measureStart();
  try {
    const { id } = req.params;
    const { status } = req.body;
    log(MODULE, `PATCH /tickets/${id} - setting status to: ${status}`);

    const ticket = getTicket(id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found', processingTimeMs: measureEnd(startMs) });
    }

    if (status !== undefined) {
      ticket.status = status;
      ticket.updatedAt = new Date().toISOString();
      saveTicket(ticket);
    }

    res.json({ success: true, ticket, processingTimeMs: measureEnd(startMs), timestamp: new Date().toISOString() });
  } catch (error) {
    logError(MODULE, `PATCH /tickets/${req.params.id} failed`, error);
    res.status(500).json({ error: error.message, processingTimeMs: measureEnd(startMs) });
  }
});

router.post('/tickets', postLimiter, checkApiKey, validateTicket, async (req, res) => {
  const startMs = measureStart();
  try {
    log(MODULE, 'POST /tickets — creating and processing ticket');
    const { subject, description, requesterId } = req.body;

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

router.post('/tickets/:id/process', postLimiter, checkApiKey, async (req, res) => {
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

router.post('/pipeline/batch', postLimiter, checkApiKey, async (req, res) => {
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

router.post('/demo/seed', postLimiter, checkApiKey, async (req, res) => {
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

    // Dynamically compute deflection rate from tickets database
    const tickets = getAllTickets();
    const total = tickets.length;
    const resolved = tickets.filter(t => t.status === 'resolved').length;
    const deflectionRate = total > 0 ? Math.round((resolved / total) * 1000) / 10 : 68.0;

    const agentPerformance = [
      { id: 'agent-001', name: 'Alex Rivera', avgResolutionTimeHours: 3.2, satisfactionScore: 4.6, slaComplianceRate: 95, ticketsResolved: 28 },
      { id: 'agent-002', name: 'Priya Sharma', avgResolutionTimeHours: 2.8, satisfactionScore: 4.5, slaComplianceRate: 92, ticketsResolved: 35 },
      { id: 'agent-003', name: 'Tom O\'Brien', avgResolutionTimeHours: 1.8, satisfactionScore: 4.9, slaComplianceRate: 98, ticketsResolved: 15 },
      { id: 'agent-004', name: 'Kim Nakamura', avgResolutionTimeHours: 2.5, satisfactionScore: 4.7, slaComplianceRate: 96, ticketsResolved: 22 },
      { id: 'agent-005', name: 'Jordan Lee', avgResolutionTimeHours: 4.1, satisfactionScore: 4.2, slaComplianceRate: 88, ticketsResolved: 41 },
    ];

    const enriched = {
      ...analytics,
      deflectionRate,
      agentPerformance,
    };

    res.json({ analytics: enriched, source, processingTimeMs: measureEnd(startMs), timestamp: new Date().toISOString() });
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

router.get('/audit-logs', checkRole(['Compliance_Auditor', 'Manager']), async (_req, res) => {
  const startMs = measureStart();
  try {
    log(MODULE, 'GET /audit-logs');
    const logs = await getAuditLogs();
    res.json({
      logs,
      count: logs.length,
      processingTimeMs: measureEnd(startMs),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logError(MODULE, 'GET /audit-logs failed', error);
    res.status(500).json({ error: error.message, processingTimeMs: measureEnd(startMs) });
  }
});

router.get('/audit-logs/:ticketId', checkRole(['Compliance_Auditor', 'Manager']), async (req, res) => {
  const startMs = measureStart();
  try {
    const { ticketId } = req.params;
    log(MODULE, `GET /audit-logs/${ticketId}`);
    const auditLog = await getAuditLogByTicket(ticketId);
    if (!auditLog) {
      return res.status(404).json({ error: `Audit log for ticket '${ticketId}' not found.`, processingTimeMs: measureEnd(startMs) });
    }
    res.json({
      log: auditLog,
      processingTimeMs: measureEnd(startMs),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logError(MODULE, `GET /audit-logs/${req.params.ticketId} failed`, error);
    res.status(500).json({ error: error.message, processingTimeMs: measureEnd(startMs) });
  }
});

export default router;
