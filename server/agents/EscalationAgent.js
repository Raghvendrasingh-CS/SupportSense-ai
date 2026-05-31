// EscalationAgent — handles escalation routing, SLA tracking, and agent assignment.
import { log, logError, measureStart, measureEnd } from '../utils/logger.js';
import { findBestAgent, getWorkloadInsights } from '../services/workIQ.js';
import { sendNotification } from '../services/microsoftGraph.js';
import { logTicketEvent } from '../services/fabricIQ.js';

const MODULE = 'EscalationAgent';

const SLA_TARGETS = {
  critical: { firstResponseMinutes: 15, resolutionHours: 4 },
  high: { firstResponseMinutes: 30, resolutionHours: 8 },
  medium: { firstResponseMinutes: 60, resolutionHours: 24 },
  low: { firstResponseMinutes: 240, resolutionHours: 72 },
};

function shouldEscalate(triageResult, resolutionResult) {
  const reasons = [];
  const priority = triageResult.classification.priority;
  const confidence = resolutionResult.resolution?.confidence || 0;

  if (priority === 'critical') {
    reasons.push({ code: 'CRITICAL_PRIORITY', detail: 'Ticket marked as critical priority' });
  }

  if (priority === 'high' && confidence < 0.7) {
    reasons.push({ code: 'LOW_CONFIDENCE_HIGH_PRIORITY', detail: 'High priority ticket with low resolution confidence' });
  }

  if (confidence < 0.5) {
    reasons.push({ code: 'LOW_CONFIDENCE', detail: `Resolution confidence ${confidence} below threshold (0.5)` });
  }

  if (resolutionResult.status === 'failed') {
    reasons.push({ code: 'RESOLUTION_FAILED', detail: 'Automated resolution attempt failed' });
  }

  if (triageResult.serviceHealth?.status === 'degraded') {
    reasons.push({ code: 'SERVICE_DEGRADED', detail: `Related service ${triageResult.serviceHealth.name} is degraded` });
  }

  if (resolutionResult.status !== 'auto_resolved' && priority !== 'low') {
    reasons.push({ code: 'MANUAL_REVIEW_REQUIRED', detail: 'Ticket requires human agent review' });
  }

  const escalate = reasons.length > 0 && (priority === 'critical' || priority === 'high' || confidence < 0.7 || resolutionResult.status === 'failed');

  return { escalate, reasons };
}

function determineEscalationTier(priority, reasons) {
  if (priority === 'critical') return 'L3';
  if (reasons.some((r) => r.code === 'SERVICE_DEGRADED')) return 'L3';
  if (priority === 'high') return 'L2';
  return 'L2';
}

function calculateSLA(priority) {
  const targets = SLA_TARGETS[priority] || SLA_TARGETS.medium;
  const now = new Date();
  return {
    priority,
    firstResponseDeadline: new Date(now.getTime() + targets.firstResponseMinutes * 60000).toISOString(),
    resolutionDeadline: new Date(now.getTime() + targets.resolutionHours * 3600000).toISOString(),
    firstResponseTargetMinutes: targets.firstResponseMinutes,
    resolutionTargetHours: targets.resolutionHours,
  };
}

export async function escalateTicket(ticket, triageResult, resolutionResult, emitFn = null) {
  const pipelineStart = measureStart();
  try {
    log(MODULE, `Evaluating escalation for ticket ${ticket.id}`);

    if (emitFn) emitFn('escalation:started', { ticketId: ticket.id, timestamp: new Date().toISOString() });

    const escalationDecision = shouldEscalate(triageResult, resolutionResult);
    const sla = calculateSLA(triageResult.classification.priority);

    if (emitFn) emitFn('escalation:decision', {
      ticketId: ticket.id,
      escalate: escalationDecision.escalate,
      reasons: escalationDecision.reasons,
      sla,
    });

    if (!escalationDecision.escalate && resolutionResult.status === 'auto_resolved') {
      const noEscalationResult = {
        agent: 'EscalationAgent',
        ticketId: ticket.id,
        escalated: false,
        reason: 'Ticket auto-resolved successfully — no escalation needed',
        sla,
        processingTimeMs: measureEnd(pipelineStart),
        timestamp: new Date().toISOString(),
      };

      log(MODULE, `No escalation needed for ${ticket.id}`);
      if (emitFn) emitFn('escalation:completed', noEscalationResult);
      return noEscalationResult;
    }

    const tier = determineEscalationTier(triageResult.classification.priority, escalationDecision.reasons);
    const requiredSkills = triageResult.requiredSkills || ['General Support'];

    const agentStart = measureStart();
    const { agent, alternatives } = await findBestAgent(requiredSkills, triageResult.classification.priority);
    log(MODULE, `Assigned agent: ${agent.name} (${agent.tier})`, { processingTimeMs: measureEnd(agentStart) });

    if (emitFn) emitFn('escalation:agent-assigned', { ticketId: ticket.id, agent, alternatives });

    const workloadStart = measureStart();
    const { insights: workloadInsights } = await getWorkloadInsights();
    log(MODULE, 'Workload insights fetched', { processingTimeMs: measureEnd(workloadStart) });

    const notificationStart = measureStart();
    const agentNotification = await sendNotification(
      agent.id,
      `[ESCALATION] Ticket ${ticket.id}: "${ticket.subject}" — Priority: ${triageResult.classification.priority}, Category: ${triageResult.classification.category}. Assigned to you based on skill match (score: ${agent.matchScore}).`
    );

    const requesterNotification = await sendNotification(
      ticket.requesterId || 'user-001',
      `Your support ticket "${ticket.subject}" has been escalated to ${agent.name} (${agent.tier} support). Expected resolution within ${sla.resolutionTargetHours} hours.`
    );
    log(MODULE, 'Notifications sent', { processingTimeMs: measureEnd(notificationStart) });

    const eventStart = measureStart();
    await logTicketEvent(ticket.id, 'escalated', {
      tier,
      agentId: agent.id,
      agentName: agent.name,
      reasons: escalationDecision.reasons.map((r) => r.code),
    });
    log(MODULE, 'Escalation event logged', { processingTimeMs: measureEnd(eventStart) });

    const result = {
      agent: 'EscalationAgent',
      ticketId: ticket.id,
      escalated: true,
      escalationTier: tier,
      reasons: escalationDecision.reasons,
      assignedAgent: {
        id: agent.id,
        name: agent.name,
        tier: agent.tier,
        skills: agent.skills,
        matchScore: agent.matchScore,
        availability: agent.availability,
      },
      alternativeAgents: (alternatives || []).map((a) => ({
        id: a.id,
        name: a.name,
        matchScore: a.matchScore,
      })),
      sla,
      notifications: {
        agent: agentNotification,
        requester: requesterNotification,
      },
      workloadInsights: {
        availableAgents: workloadInsights.availableAgents,
        avgWorkload: workloadInsights.avgWorkload,
      },
      processingTimeMs: measureEnd(pipelineStart),
      timestamp: new Date().toISOString(),
    };

    log(MODULE, `Escalation complete for ${ticket.id}`, {
      tier,
      agent: agent.name,
      processingTimeMs: result.processingTimeMs,
    });

    if (emitFn) emitFn('escalation:completed', result);

    return result;
  } catch (error) {
    logError(MODULE, 'escalateTicket failed', error);
    const fallback = {
      agent: 'EscalationAgent',
      ticketId: ticket.id,
      escalated: true,
      escalationTier: 'L2',
      reasons: [{ code: 'ESCALATION_ERROR', detail: error.message }],
      assignedAgent: { id: 'agent-fallback', name: 'Support Queue', tier: 'L2', matchScore: 0 },
      sla: calculateSLA(triageResult?.classification?.priority || 'medium'),
      processingTimeMs: measureEnd(pipelineStart),
      error: error.message,
      timestamp: new Date().toISOString(),
    };
    if (emitFn) emitFn('escalation:error', fallback);
    return fallback;
  }
}

export async function checkSLACompliance(tickets) {
  const startMs = measureStart();
  try {
    log(MODULE, `Checking SLA compliance for ${tickets.length} tickets`);

    const now = Date.now();
    const results = tickets.map((ticket) => {
      const priority = ticket.priority || 'medium';
      const sla = SLA_TARGETS[priority] || SLA_TARGETS.medium;
      const created = new Date(ticket.createdDateTime || ticket.createdAt).getTime();
      const ageMinutes = (now - created) / 60000;
      const ageHours = ageMinutes / 60;

      const firstResponseBreached = ageMinutes > sla.firstResponseMinutes && ticket.status === 'open';
      const resolutionBreached = ageHours > sla.resolutionHours && ticket.status !== 'resolved';

      return {
        ticketId: ticket.id,
        priority,
        ageMinutes: Math.round(ageMinutes),
        firstResponseBreached,
        resolutionBreached,
        slaStatus: firstResponseBreached || resolutionBreached ? 'breached' : 'compliant',
      };
    });

    const breached = results.filter((r) => r.slaStatus === 'breached');

    return {
      total: tickets.length,
      compliant: results.length - breached.length,
      breached: breached.length,
      details: results,
      processingTimeMs: measureEnd(startMs),
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logError(MODULE, 'checkSLACompliance failed', error);
    return { total: 0, compliant: 0, breached: 0, details: [], processingTimeMs: measureEnd(startMs), error: error.message };
  }
}
