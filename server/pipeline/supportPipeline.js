// Support pipeline orchestrator — runs Triage → Resolution → Escalation agents sequentially.
import { v4 as uuidv4 } from 'uuid';
import { log, logError, measureStart, measureEnd } from '../utils/logger.js';
import { triageTicket } from '../agents/TriageAgent.js';
import { resolveTicket } from '../agents/ResolutionAgent.js';
import { escalateTicket } from '../agents/EscalationAgent.js';

const MODULE = 'SupportPipeline';

const ticketStore = new Map();

export function getTicket(ticketId) {
  return ticketStore.get(ticketId) || null;
}

export function getAllTickets() {
  return Array.from(ticketStore.values());
}

export function createTicket(data) {
  const ticket = {
    id: data.id || `TKT-${uuidv4().slice(0, 8).toUpperCase()}`,
    subject: data.subject,
    description: data.description || '',
    requesterId: data.requesterId || 'user-001',
    status: 'received',
    priority: data.priority || null,
    category: data.category || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    pipeline: null,
  };
  ticketStore.set(ticket.id, ticket);
  return ticket;
}

export async function processTicket(ticketData, emitFn = null) {
  const pipelineStart = measureStart();
  try {
    const ticket = typeof ticketData === 'string'
      ? ticketStore.get(ticketData)
      : ticketData.id
        ? ticketData
        : createTicket(ticketData);

    if (!ticket) {
      throw new Error(`Ticket not found: ${ticketData}`);
    }

    log(MODULE, `Pipeline started for ${ticket.id}`, { subject: ticket.subject });

    if (emitFn) {
      emitFn('pipeline:started', {
        ticketId: ticket.id,
        subject: ticket.subject,
        timestamp: new Date().toISOString(),
      });
    }

    ticket.status = 'triaging';
    ticket.updatedAt = new Date().toISOString();
    ticketStore.set(ticket.id, ticket);

    const triageStart = measureStart();
    const triageResult = await triageTicket(ticket, emitFn);
    log(MODULE, 'TriageAgent finished', { processingTimeMs: measureEnd(triageStart) });

    ticket.status = 'resolving';
    ticket.priority = triageResult.classification.priority;
    ticket.category = triageResult.classification.category;
    ticket.updatedAt = new Date().toISOString();
    ticketStore.set(ticket.id, ticket);

    const resolutionStart = measureStart();
    const resolutionResult = await resolveTicket(ticket, triageResult, emitFn);
    log(MODULE, 'ResolutionAgent finished', { processingTimeMs: measureEnd(resolutionStart) });

    ticket.status = resolutionResult.status === 'auto_resolved' ? 'resolved' : 'escalating';
    ticket.updatedAt = new Date().toISOString();
    ticketStore.set(ticket.id, ticket);

    const escalationStart = measureStart();
    const escalationResult = await escalateTicket(ticket, triageResult, resolutionResult, emitFn);
    log(MODULE, 'EscalationAgent finished', { processingTimeMs: measureEnd(escalationStart) });

    if (escalationResult.escalated) {
      ticket.status = 'escalated';
      ticket.assignedAgent = escalationResult.assignedAgent;
    } else if (resolutionResult.status === 'auto_resolved') {
      ticket.status = 'resolved';
    } else {
      ticket.status = 'pending_review';
    }

    const totalProcessingTimeMs = measureEnd(pipelineStart);

    ticket.pipeline = {
      triage: triageResult,
      resolution: resolutionResult,
      escalation: escalationResult,
      totalProcessingTimeMs,
      completedAt: new Date().toISOString(),
    };
    ticket.updatedAt = new Date().toISOString();
    ticketStore.set(ticket.id, ticket);

    const pipelineResult = {
      ticketId: ticket.id,
      subject: ticket.subject,
      status: ticket.status,
      triage: triageResult,
      resolution: resolutionResult,
      escalation: escalationResult,
      totalProcessingTimeMs,
      timestamp: new Date().toISOString(),
    };

    log(MODULE, `Pipeline complete for ${ticket.id}`, {
      status: ticket.status,
      totalProcessingTimeMs,
    });

    if (emitFn) {
      emitFn('pipeline:completed', pipelineResult);
    }

    return pipelineResult;
  } catch (error) {
    logError(MODULE, 'processTicket failed', error);
    const errorResult = {
      ticketId: typeof ticketData === 'object' ? ticketData.id : ticketData,
      status: 'error',
      error: error.message,
      totalProcessingTimeMs: measureEnd(pipelineStart),
      timestamp: new Date().toISOString(),
    };
    if (emitFn) emitFn('pipeline:error', errorResult);
    return errorResult;
  }
}

export async function processBatch(ticketList, emitFn = null) {
  const startMs = measureStart();
  try {
    log(MODULE, `Processing batch of ${ticketList.length} tickets`);

    if (emitFn) {
      emitFn('batch:started', { count: ticketList.length, timestamp: new Date().toISOString() });
    }

    const results = [];
    for (const ticketData of ticketList) {
      const result = await processTicket(ticketData, emitFn);
      results.push(result);
    }

    const batchResult = {
      processed: results.length,
      resolved: results.filter((r) => r.status === 'resolved').length,
      escalated: results.filter((r) => r.status === 'escalated').length,
      errors: results.filter((r) => r.status === 'error').length,
      results,
      processingTimeMs: measureEnd(startMs),
      timestamp: new Date().toISOString(),
    };

    log(MODULE, 'Batch processing complete', batchResult);

    if (emitFn) emitFn('batch:completed', batchResult);

    return batchResult;
  } catch (error) {
    logError(MODULE, 'processBatch failed', error);
    return { processed: 0, errors: 1, error: error.message, processingTimeMs: measureEnd(startMs) };
  }
}

export function seedDemoTickets() {
  const demos = [
    { subject: 'Cannot access SharePoint project site — Access Denied', description: 'Getting access denied when trying to open the Contoso Project Alpha SharePoint site. Was working yesterday.', requesterId: 'user-001' },
    { subject: 'Outlook calendar not syncing with mobile device', description: 'Calendar events created on desktop Outlook are not appearing on my iPhone Outlook app. Email sync works fine.', requesterId: 'user-002' },
    { subject: 'Teams meeting audio cutting out during calls', description: 'During Teams video calls, my audio drops every few minutes. Video works fine. This is blocking my client meetings.', requesterId: 'user-003' },
  ];

  return demos.map((d) => createTicket(d));
}
