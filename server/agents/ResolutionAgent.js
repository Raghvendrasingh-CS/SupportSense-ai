// ResolutionAgent — generates solutions using KB, similar tickets, and service context.
import { log, logError, measureStart, measureEnd } from '../utils/logger.js';
import { searchKnowledgeBase, logTicketEvent } from '../services/fabricIQ.js';
import { predictResolutionTime } from '../services/workIQ.js';
import { sendNotification } from '../services/microsoftGraph.js';
import { config, hasOpenAICredentials } from '../config/env.js';

const MODULE = 'ResolutionAgent';

const RESOLUTION_TEMPLATES = {
  SharePoint: {
    steps: [
      'Verify user has correct permissions on the SharePoint site',
      'Check if user is member of the associated M365 group',
      'Clear browser cache and cookies, then re-authenticate',
      'Test access via incognito/private browsing window',
      'If issue persists, check SharePoint admin center for site lock status',
    ],
    automatedFixes: ['clear_browser_cache', 'verify_group_membership'],
  },
  Exchange: {
    steps: [
      'Verify mailbox is active and not soft-deleted',
      'Check Outlook cached mode settings (File > Account Settings)',
      'Run Outlook in safe mode to rule out add-in conflicts',
      'Reset folder views and rebuild search index',
      'Verify autodiscover record resolves correctly',
    ],
    automatedFixes: ['reset_outlook_profile', 'rebuild_ost'],
  },
  Teams: {
    steps: [
      'Ensure Teams client is updated to latest version',
      'Check network connectivity and firewall rules for Teams ports',
      'Verify microphone/camera permissions in OS settings',
      'Sign out and sign back into Teams',
      'Run Teams admin diagnostics tool',
    ],
    automatedFixes: ['update_teams_client', 'clear_teams_cache'],
  },
  Identity: {
    steps: [
      'Direct user to self-service password reset portal (aka.ms/sspr)',
      'Verify MFA methods are registered and working',
      'Check for account lockout in Azure AD sign-in logs',
      'Confirm conditional access policies are not blocking access',
      'Reset MFA registration if methods are corrupted',
    ],
    automatedFixes: ['unlock_account', 'send_sspr_link'],
  },
  Network: {
    steps: [
      'Verify VPN client version matches corporate standard',
      'Check network adapter settings and DNS configuration',
      'Test connectivity to VPN gateway endpoint',
      'Review split tunneling configuration',
      'Try alternate VPN gateway if available',
    ],
    automatedFixes: ['restart_vpn_service', 'flush_dns'],
  },
  General: {
    steps: [
      'Gather detailed error messages and screenshots from user',
      'Check if issue is reproducible on another device',
      'Review recent changes to user account or device',
      'Search knowledge base for similar resolved tickets',
      'Escalate to specialist if standard troubleshooting fails',
    ],
    automatedFixes: [],
  },
};

async function generateResolutionWithLLM(ticket, triageResult, kbArticles) {
  const startMs = measureStart();
  try {
    if (!hasOpenAICredentials()) {
      return null;
    }

    const kbContext = kbArticles.map((a) => `- ${a.title}: ${a.content}`).join('\n');
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openai.apiKey}`,
      },
      body: JSON.stringify({
        model: config.openai.model,
        messages: [
          {
            role: 'system',
            content: 'You are an enterprise IT support resolution agent. Provide a JSON response: { resolutionSummary, steps: string[], confidence, canAutoResolve: boolean }',
          },
          {
            role: 'user',
            content: `Ticket: ${ticket.subject}\nDescription: ${ticket.description}\nCategory: ${triageResult.classification.category}\nPriority: ${triageResult.classification.priority}\n\nKnowledge Base:\n${kbContext}`,
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI resolution failed: ${response.status}`);
    }

    const data = await response.json();
    const parsed = JSON.parse(data.choices[0].message.content);
    return { ...parsed, processingTimeMs: measureEnd(startMs), source: 'openai' };
  } catch (error) {
    logError(MODULE, 'LLM resolution generation failed', error);
    return null;
  }
}

function buildResolutionFromTemplate(category, kbArticles, similarTickets) {
  const template = RESOLUTION_TEMPLATES[category] || RESOLUTION_TEMPLATES.General;
  const steps = [...template.steps];

  if (kbArticles.length > 0) {
    steps.unshift(`Reference KB article: "${kbArticles[0].title}" (relevance: ${Math.round(kbArticles[0].relevanceScore * 100)}%)`);
  }

  if (similarTickets.length > 0) {
    steps.push(`Previous similar ticket ${similarTickets[0].id} was resolved by: ${similarTickets[0].resolution}`);
  }

  const canAutoResolve = template.automatedFixes.length > 0 && kbArticles.some((a) => a.relevanceScore > 0.85);

  return {
    resolutionSummary: `Standard ${category} troubleshooting procedure with ${kbArticles.length} KB matches and ${similarTickets.length} similar tickets`,
    steps,
    confidence: kbArticles.length > 0 ? kbArticles[0].relevanceScore : 0.65,
    canAutoResolve,
    automatedFixes: template.automatedFixes,
    source: 'template',
  };
}

export async function resolveTicket(ticket, triageResult, emitFn = null) {
  const pipelineStart = measureStart();
  try {
    log(MODULE, `Starting resolution for ticket ${ticket.id}`, {
      category: triageResult.classification.category,
    });

    if (emitFn) emitFn('resolution:started', { ticketId: ticket.id, timestamp: new Date().toISOString() });

    const searchQuery = `${ticket.subject} ${triageResult.classification.category}`;
    const kbStart = measureStart();
    const { results: kbArticles } = await searchKnowledgeBase(searchQuery);
    log(MODULE, `KB search returned ${kbArticles.length} articles`, { processingTimeMs: measureEnd(kbStart) });

    if (emitFn) emitFn('resolution:kb-search', { ticketId: ticket.id, articles: kbArticles });

    const similarTickets = triageResult.similarTickets || [];
    const category = triageResult.classification.category;

    const llmResolution = await generateResolutionWithLLM(ticket, triageResult, kbArticles);
    const templateResolution = buildResolutionFromTemplate(category, kbArticles, similarTickets);

    const resolution = llmResolution || templateResolution;

    const predictStart = measureStart();
    const timePrediction = await predictResolutionTime(
      category,
      triageResult.classification.priority,
      'L2'
    );
    log(MODULE, 'Resolution time predicted', { processingTimeMs: measureEnd(predictStart) });

    const autoResolveEligible = resolution.canAutoResolve && triageResult.classification.priority !== 'critical';

    let autoResolveResult = null;
    if (autoResolveEligible) {
      autoResolveResult = await attemptAutoResolve(ticket, resolution, emitFn);
    }

    const eventStart = measureStart();
    await logTicketEvent(ticket.id, 'resolution_generated', {
      category,
      confidence: resolution.confidence,
      autoResolved: autoResolveResult?.success || false,
    });
    log(MODULE, 'Ticket event logged', { processingTimeMs: measureEnd(eventStart) });

    const result = {
      agent: 'ResolutionAgent',
      ticketId: ticket.id,
      resolution: {
        summary: resolution.resolutionSummary,
        steps: resolution.steps,
        confidence: Math.round((resolution.confidence || 0.65) * 100) / 100,
        canAutoResolve: autoResolveEligible,
        automatedFixes: resolution.automatedFixes || [],
      },
      knowledgeBase: kbArticles.slice(0, 3),
      similarTickets: similarTickets.slice(0, 3),
      timePrediction,
      autoResolve: autoResolveResult,
      status: autoResolveResult?.success ? 'auto_resolved' : 'pending_review',
      processingTimeMs: measureEnd(pipelineStart),
      timestamp: new Date().toISOString(),
    };

    log(MODULE, `Resolution complete for ${ticket.id}`, {
      status: result.status,
      confidence: result.resolution.confidence,
      processingTimeMs: result.processingTimeMs,
    });

    if (emitFn) emitFn('resolution:completed', result);

    return result;
  } catch (error) {
    logError(MODULE, 'resolveTicket failed', error);
    const fallback = {
      agent: 'ResolutionAgent',
      ticketId: ticket.id,
      resolution: {
        summary: 'Manual resolution required — automated resolution failed',
        steps: RESOLUTION_TEMPLATES.General.steps,
        confidence: 0.3,
        canAutoResolve: false,
      },
      status: 'failed',
      processingTimeMs: measureEnd(pipelineStart),
      error: error.message,
      timestamp: new Date().toISOString(),
    };
    if (emitFn) emitFn('resolution:error', fallback);
    return fallback;
  }
}

async function attemptAutoResolve(ticket, resolution, emitFn) {
  const startMs = measureStart();
  try {
    log(MODULE, `Attempting auto-resolve for ${ticket.id}`);

    if (emitFn) emitFn('resolution:auto-resolve-started', { ticketId: ticket.id });

    const fixes = resolution.automatedFixes || [];
    const appliedFixes = fixes.map((fix) => ({
      fix,
      status: 'simulated_success',
      detail: `Auto-fix "${fix}" applied successfully in demo environment`,
    }));

    const notification = await sendNotification(
      ticket.requesterId || 'user-001',
      `Your support ticket "${ticket.subject}" has been automatically resolved. Applied fixes: ${fixes.join(', ')}. Please verify and reply if the issue persists.`
    );

    const result = {
      success: true,
      appliedFixes,
      notification,
      processingTimeMs: measureEnd(startMs),
    };

    if (emitFn) emitFn('resolution:auto-resolve-completed', { ticketId: ticket.id, result });

    return result;
  } catch (error) {
    logError(MODULE, 'Auto-resolve failed', error);
    return { success: false, error: error.message, processingTimeMs: measureEnd(startMs) };
  }
}
