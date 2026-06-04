// EscalationAgent — handles escalation routing, SLA tracking, and agent assignment.
import { log, logError, measureStart, measureEnd } from '../utils/logger.js';
import { findBestAgent, getWorkloadInsights } from '../services/workIQ.js';
import { sendNotification } from '../services/microsoftGraph.js';
import { logTicketEvent } from '../services/fabricIQ.js';
import { sendAdaptiveCardToTeams } from '../services/teamsWebhook.js';

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

  const escalate = reasons.length > 0 && priority !== 'low' && (priority === 'critical' || priority === 'high' || confidence < 0.7 || resolutionResult.status === 'failed');

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

function generateAdaptiveCard(ticket, triageResult, agent, sla) {
  return {
    "type": "AdaptiveCard",
    "version": "1.4",
    "body": [
      {
        "type": "Container",
        "style": "emphasis",
        "bleed": true,
        "items": [
          {
            "type": "TextBlock",
            "text": `⚠️ Escalation Tier: ${agent?.tier || 'L2'}`,
            "weight": "Bolder",
            "color": triageResult.classification.priority === 'critical' ? "Attention" : "Warning",
            "size": "Medium"
          },
          {
            "type": "TextBlock",
            "text": ticket.subject,
            "weight": "Bolder",
            "size": "Large",
            "wrap": true
          }
        ]
      },
      {
        "type": "Container",
        "items": [
          {
            "type": "FactSet",
            "facts": [
              {
                "title": "Ticket ID:",
                "value": ticket.id
              },
              {
                "title": "Category:",
                "value": triageResult.classification.category
              },
              {
                "title": "Priority:",
                "value": triageResult.classification.priority.toUpperCase()
              }
            ]
          }
        ]
      },
      {
        "type": "TextBlock",
        "text": "Assigned Specialist Representative",
        "weight": "Bolder",
        "separator": true,
        "spacing": "Medium"
      },
      {
        "type": "ColumnSet",
        "columns": [
          {
            "type": "Column",
            "width": "auto",
            "items": [
              {
                "type": "Image",
                "url": `https://ui-avatars.com/api/?name=${encodeURIComponent(agent?.name || 'Support Agent')}&background=0ea5e9&color=fff&bold=true`,
                "size": "Small",
                "style": "Person"
              }
            ]
          },
          {
            "type": "Column",
            "width": "stretch",
            "items": [
              {
                "type": "TextBlock",
                "text": agent?.name || 'Support Agent',
                "weight": "Bolder",
                "wrap": true
              },
              {
                "type": "TextBlock",
                "text": `Match Score: ${Math.round((agent?.matchScore || 0.85) * 100)}% | Tier: ${agent?.tier || 'L2'}`,
                "isSubdued": true,
                "spacing": "None",
                "wrap": true
              }
            ]
          }
        ]
      },
      {
        "type": "Container",
        "separator": true,
        "spacing": "Medium",
        "items": [
          {
            "type": "TextBlock",
            "text": `SLA Response Deadline: ${new Date(sla.firstResponseDeadline).toLocaleTimeString()}`,
            "weight": "Bolder",
            "color": "Attention"
          },
          {
            "type": "TextBlock",
            "text": `SLA Resolution Target: ${sla.resolutionTargetHours} hrs`,
            "isSubdued": true,
            "spacing": "None"
          }
        ]
      }
    ],
    "actions": [
      {
        "type": "Action.Submit",
        "title": "Accept Assignment",
        "data": {
          "action": "accept",
          "ticketId": ticket.id
        }
      },
      {
        "type": "Action.OpenUrl",
        "title": "View Request Detail",
        "url": `http://localhost:3000/tickets/${ticket.id}`
      }
    ]
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
      if (emitFn) {
        emitFn('reasoning:step', {
          ticketId: ticket.id,
          stepNumber: 7,
          stepName: 'Enterprise Routing & SLA',
          agent: 'EscalationAgent',
          microsoftTech: 'Entra ID & M365 Graph',
          description: 'Automated resolution verified — no human escalation required',
          signals: [
            'No human escalation needed',
            'SLA compliance checked'
          ],
          decision: 'Ticket resolved automatically by ResolutionAgent',
          confidence: 1.0
        });
        emitFn('escalation:completed', noEscalationResult);
      }
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

    const adaptiveCard = generateAdaptiveCard(ticket, triageResult, agent, sla);
    const teamsResult = await sendAdaptiveCardToTeams(adaptiveCard, `Escalation: ${ticket.subject}`);
    log(MODULE, 'Teams notification result', teamsResult);

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
        teams: teamsResult,
      },
      workloadInsights: {
        availableAgents: workloadInsights.availableAgents,
        avgWorkload: workloadInsights.avgWorkload,
      },
      adaptiveCard,
      processingTimeMs: measureEnd(pipelineStart),
      timestamp: new Date().toISOString(),
    };

    log(MODULE, `Escalation complete for ${ticket.id}`, {
      tier,
      agent: agent.name,
      processingTimeMs: result.processingTimeMs,
    });

    if (emitFn) {
      emitFn('reasoning:step', {
        ticketId: ticket.id,
        stepNumber: 7,
        stepName: 'Enterprise Routing & SLA',
        agent: 'EscalationAgent',
        microsoftTech: 'Entra ID & M365 Graph',
        description: 'Routing to available expert and generating response target SLAs',
        signals: [
          `Assigned agent: ${agent.name} (Tier: ${agent.tier})`,
          `SLA Response Target: ${sla.firstResponseTargetMinutes} min`,
          `Skill match score: ${Math.round(agent.matchScore * 100)}%`
        ],
        decision: `Dispatched Adaptive Card notification to ${agent.name} with SLA deadline ${new Date(sla.firstResponseDeadline).toLocaleTimeString()}`,
        confidence: agent.matchScore
      });
      emitFn('escalation:completed', result);
    }

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
