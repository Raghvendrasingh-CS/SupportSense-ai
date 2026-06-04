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
      "Gather more details about the specific issue and affected systems",
      "Check Microsoft 365 Service Health dashboard for any known outages",
      "Review recent changes to the user's account or permissions",
      "Search knowledge base for similar reported issues",
      "If issue persists, escalate to appropriate specialist team"
    ],
    automatedFixes: ["check_service_health", "search_kb"]
  },
  Complaint: {
    steps: [
      "Acknowledge the customer's frustration sincerely and apologize for the repeated issue",
      "Review full ticket history to understand all previous attempts to resolve this issue",
      "Escalate immediately to senior support manager — do not attempt self-service resolution",
      "Schedule a direct callback within 2 hours from account manager or senior engineer",
      "Provide a formal incident reference number and written commitment to resolution timeline",
      "Follow up within 24 hours with a detailed resolution plan or compensation offer"
    ],
    automatedFixes: ["escalate_to_senior", "schedule_callback", "create_incident_report"]
  },
  PowerPlatform: {
    steps: [
      "Check Power Automate run history for the specific flow that is failing",
      "Verify all connection credentials are still valid and not expired",
      "Check if the flow trigger conditions are being met correctly",
      "Review connector permissions and re-authenticate if needed",
      "Test the flow manually with simplified inputs to isolate the failure point"
    ],
    automatedFixes: ["refresh_connections", "check_flow_history"]
  },
  Hardware: {
    steps: [
      "Check physical connections and cables for the device",
      "Verify device drivers are updated to the latest certified version",
      "Restart the device and run built-in hardware diagnostics",
      "Check for resource conflicts in OS device manager",
      "If physical damage or failure is confirmed, initiate hardware replacement process"
    ],
    automatedFixes: ["run_hardware_diagnostics", "request_hardware_replacement"]
  },
};

async function generateResolutionWithLLM(ticket, triageResult, kbArticles) {
  const startMs = measureStart();
  try {
    if (!hasOpenAICredentials()) {
      return null;
    }

    const kbContext = kbArticles.map((a) => `- ${a.title}: ${a.content}`).join('\n');
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
      throw new Error(`LLM resolution failed: ${response.status}`);
    }

    const data = await response.json();
    const parsed = JSON.parse(data.choices[0].message.content);
    return { ...parsed, processingTimeMs: measureEnd(startMs), source: isAzure ? 'azure-openai' : 'openai' };
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

  const canAutoResolve = template.automatedFixes.length > 0 && 
  (kbArticles.some((a) => a.relevanceScore > 0.85) || 
  ['Identity', 'General'].includes(category) && triageResult.classification.priority === 'low');

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
    const resolutionSource = llmResolution ? (llmResolution.source || 'openai') : 'template';
    log(MODULE, `Resolution source: ${resolutionSource} for ticket ${ticket.id}`);

    if (llmResolution && emitFn) {
      emitFn('reasoning:step', {
        ticketId: ticket.id,
        stepNumber: 5.5,
        stepName: 'AI Solution Draft',
        agent: 'ResolutionAgent',
        microsoftTech: 'Azure OpenAI GPT-4o',
        description: 'Generating custom resolution plan and auto-remediation steps using generative AI models',
        signals: [
          `LLM resolution generated: Yes`,
          `Confidence score: ${Math.round((llmResolution.confidence || 0.85) * 100)}%`,
          `AI resolution source: ${llmResolution.source || 'openai'}`
        ],
        decision: `Drafted AI-generated resolution summary: "${llmResolution.resolutionSummary || llmResolution.summary}"`,
        confidence: llmResolution.confidence || 0.85
      });
    }

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

    if (emitFn) {
      emitFn('reasoning:step', {
        ticketId: ticket.id,
        stepNumber: 6,
        stepName: 'Knowledge Retrieval & Draft',
        agent: 'ResolutionAgent',
        microsoftTech: 'Fabric IQ — Semantic',
        description: 'Querying Microsoft Fabric knowledge base and resolved historical cases',
        signals: [
          `Fabric KB articles found: ${kbArticles.length}`,
          `Similar historical tickets: ${similarTickets.length}`,
          `Resolution confidence: ${Math.round(resolution.confidence * 100)}%`
        ],
        decision: autoResolveEligible 
          ? 'High confidence match — trigger automated resolution and user notification'
          : 'Low confidence match — draft recommendation and queue for escalation',
        confidence: resolution.confidence
      });
    }

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
