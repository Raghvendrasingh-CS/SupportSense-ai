import { config, hasOpenAICredentials } from '../config/env.js';
import { log, logError, measureStart, measureEnd } from '../utils/logger.js';

const MODULE = 'DebateEngine';

async function callLLM(messages) {
  try {
    if (!hasOpenAICredentials() || config.demoMode) {
  return null;
}

    const isAzure = Boolean(config.azureOpenai.endpoint && config.azureOpenai.apiKey);
    const url = isAzure
      ? `${config.azureOpenai.endpoint.replace(/\/$/, '')}/openai/deployments/${config.azureOpenai.deployment}/chat/completions?api-version=2024-02-01`
      : 'https://api.openai.com/v1/chat/completions';

    const headers = {
      'Content-Type': 'application/json',
    };
    if (isAzure) {
      headers['api-key'] = config.azureOpenai.apiKey;
    } else {
      headers['Authorization'] = `Bearer ${config.openai.apiKey}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...(isAzure ? {} : { model: config.openai.model }),
        messages,
        response_format: { type: 'json_object' },
        max_tokens: 600,
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM debate call failed: ${response.status}`);
    }

    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);
  } catch (error) {
    logError(MODULE, 'callLLM failed', error);
    return null;
  }
}

/**
 * Executes a debate cycle between ResolutionAgent and EscalationAgent.
 */
export async function runDebate(ticket, triageResult, initialResolution, initialEscalation, emitFn = null) {
  const startMs = measureStart();
  log(MODULE, `Initiating Debate Cycle for ticket ${ticket.id}`);

  let currentResolution = { ...initialResolution.resolution, status: initialResolution.status };
  let currentEscalation = {
    escalate: initialEscalation.escalated,
    reasons: initialEscalation.reasons || [],
    escalationTier: initialEscalation.escalationTier || 'L2',
    assignedAgent: initialEscalation.assignedAgent || null,
  };

  const debateLogs = [];
  let consensusReached = false;
  let humanInTheLoop = false;
  let iteration = 0;

  // We loop for up to 3 iterations
  while (iteration < 3 && !consensusReached && !humanInTheLoop) {
    iteration++;
    log(MODULE, `Running debate iteration ${iteration}`);

    if (emitFn) {
      emitFn('debate:started', {
        ticketId: ticket.id,
        iteration,
        timestamp: new Date().toISOString(),
      });
    }

    // Check for explicit human-in-the-loop signals (e.g. legal threat + low confidence)
    if (
      triageResult.classification.sentiment === 'angry' &&
      triageResult.classification.category === 'Complaint' &&
      currentResolution.confidence < 0.6
    ) {
      humanInTheLoop = true;
      debateLogs.push({
        iteration,
        speaker: 'System',
        message: 'High risk detected: Angry customer filing legal complaint with low confidence AI resolution. Flagging for Human-in-the-Loop review.',
        state: { humanInTheLoop: true },
      });
      if (emitFn) {
        emitFn('debate:round', {
          ticketId: ticket.id,
          iteration,
          speaker: 'System',
          message: 'High risk detected: Angry customer filing legal complaint. Flagging for Human-in-the-Loop review.',
        });
      }
      break;
    }

    // Simulate or call LLM for ResolutionAgent critique
    let resCritique = null;
    if (hasOpenAICredentials()) {
      const messages = [
        {
          role: 'system',
          content: 'You are the ResolutionAgent. Critique the EscalationAgent\'s proposal. Decide if you should adjust your confidence or auto-resolve flag. Output JSON: { resolutionSummary, steps: string[], confidence, canAutoResolve: boolean, critique: string }',
        },
        {
          role: 'user',
          content: `Ticket: ${ticket.subject}\nDescription: ${ticket.description}\nTriage: ${JSON.stringify(triageResult.classification)}\nYour current resolution: ${JSON.stringify(currentResolution)}\nEscalation proposal: ${JSON.stringify(currentEscalation)}`,
        },
      ];
      resCritique = await callLLM(messages);
    }

    // Fallback/Simulated Resolution Agent critique
    if (!resCritique) {
      resCritique = {
        critique: `Evaluating escalation details. The client risk profile is ${ticket.riskProfile?.riskLevel || 'normal'}. Escalation suggests ${currentEscalation.escalate ? 'escalating to ' + currentEscalation.escalationTier : 'resolving directly'}.`,
        confidence: currentResolution.confidence,
        canAutoResolve: currentResolution.canAutoResolve,
        resolutionSummary: currentResolution.summary || currentResolution.resolutionSummary,
        steps: currentResolution.steps,
      };

      // Rule-based adjustment during debate
      if (currentEscalation.escalate && currentResolution.canAutoResolve) {
        resCritique.critique += ' Since EscalationAgent strongly recommends escalation due to SLA risks, I will reduce my auto-resolve confidence and yield to manual review.';
        resCritique.confidence = Math.max(0.4, currentResolution.confidence - 0.25);
        resCritique.canAutoResolve = false;
      }
    }

    currentResolution = {
      ...currentResolution,
      confidence: resCritique.confidence,
      canAutoResolve: resCritique.canAutoResolve,
      summary: resCritique.resolutionSummary || resCritique.summary || currentResolution.summary,
      steps: resCritique.steps || currentResolution.steps,
    };

    debateLogs.push({
      iteration,
      speaker: 'ResolutionAgent',
      message: resCritique.critique,
      state: { ...currentResolution },
    });

    if (emitFn) {
      emitFn('debate:round', {
        ticketId: ticket.id,
        iteration,
        speaker: 'ResolutionAgent',
        message: resCritique.critique,
      });
    }

    // Simulate or call LLM for EscalationAgent critique
    let escCritique = null;
    if (hasOpenAICredentials()) {
      const messages = [
        {
          role: 'system',
          content: 'You are the EscalationAgent. Critique the ResolutionAgent\'s updated proposal. Decide if you should adjust your escalation flag or tier. Output JSON: { escalate: boolean, escalationTier: string, critique: string }',
        },
        {
          role: 'user',
          content: `Ticket: ${ticket.subject}\nDescription: ${ticket.description}\nTriage: ${JSON.stringify(triageResult.classification)}\nResolution proposal: ${JSON.stringify(currentResolution)}\nYour current escalation: ${JSON.stringify(currentEscalation)}`,
        },
      ];
      escCritique = await callLLM(messages);
    }

    if (!escCritique) {
      escCritique = {
        critique: `Analyzing ResolutionAgent's update. Their confidence is now ${currentResolution.confidence}.`,
        escalate: currentEscalation.escalate,
        escalationTier: currentEscalation.escalationTier,
      };

      if (!currentResolution.canAutoResolve && currentResolution.confidence < 0.7) {
        escCritique.critique += ' Resolution confidence is low. I assert that we MUST escalate to L2 support to maintain SLA compliance.';
        escCritique.escalate = true;
        escCritique.escalationTier = 'L2';
      } else if (currentResolution.canAutoResolve && currentResolution.confidence >= 0.85) {
        escCritique.critique += ' High confidence resolution matching KB. I agree to cancel escalation and allow auto-resolution.';
        escCritique.escalate = false;
      }
    }

    currentEscalation = {
      ...currentEscalation,
      escalate: escCritique.escalate,
      escalationTier: escCritique.escalationTier,
    };

    debateLogs.push({
      iteration,
      speaker: 'EscalationAgent',
      message: escCritique.critique,
      state: { ...currentEscalation },
    });

    if (emitFn) {
      emitFn('debate:round', {
        ticketId: ticket.id,
        iteration,
        speaker: 'EscalationAgent',
        message: escCritique.critique,
      });
    }

    // Consensus Check
    // We have consensus if:
    // 1) Resolution agent wants to auto-resolve AND Escalation agent agrees NOT to escalate
    // OR 2) Both agree to escalate (Resolution agent set canAutoResolve = false, and Escalation agent set escalate = true)
    if (
      (currentResolution.canAutoResolve === false && currentEscalation.escalate === true) ||
      (currentResolution.canAutoResolve === true && currentEscalation.escalate === false)
    ) {
      consensusReached = true;
      debateLogs.push({
        iteration,
        speaker: 'System',
        message: `Consensus reached: both agents agree to ${currentEscalation.escalate ? 'escalate to ' + currentEscalation.escalationTier : 'auto-resolve the ticket'}.`,
        state: { consensusReached: true },
      });
      if (emitFn) {
        emitFn('debate:round', {
          ticketId: ticket.id,
          iteration,
          speaker: 'System',
          message: `Consensus reached: both agents agree to ${currentEscalation.escalate ? 'escalate' : 'auto-resolve'}.`,
        });
      }
    }

    if (currentResolution.canAutoResolve === true && currentEscalation.escalate === true) {
      debateLogs.push({
        iteration,
        speaker: 'System',
        message: 'Direct conflict detected: ResolutionAgent wants to auto-resolve but EscalationAgent insists on escalation. Setting human-in-the-loop flag.',
        state: { humanInTheLoop: true }
      });
      if (emitFn) {
        emitFn('debate:round', {
          ticketId: ticket.id,
          iteration,
          speaker: 'System',
          message: 'Direct conflict detected: ResolutionAgent wants to auto-resolve but EscalationAgent insists on escalation. Flagging for Human-in-the-Loop review.',
        });
      }
      humanInTheLoop = true;
      break;
    }
  }

  // Final consensus values
  const finalStatus = humanInTheLoop
    ? 'pending_review'
    : currentEscalation.escalate
      ? 'escalated'
      : 'resolved';

  const processingTimeMs = measureEnd(startMs);
  log(MODULE, `Debate Cycle complete. Consensus: ${consensusReached}, HumanInTheLoop: ${humanInTheLoop}, Final Status: ${finalStatus}`);

  return {
    consensusReached,
    humanInTheLoop,
    iterations: iteration,
    debateLogs,
    finalStatus,
    resolution: {
      summary: currentResolution.summary || currentResolution.resolutionSummary,
      steps: currentResolution.steps,
      confidence: currentResolution.confidence,
      canAutoResolve: currentResolution.canAutoResolve,
    },
    escalation: {
      escalated: currentEscalation.escalate,
      reasons: currentEscalation.reasons,
      escalationTier: currentEscalation.escalationTier,
      assignedAgent: currentEscalation.assignedAgent,
    },
    processingTimeMs,
  };
}
