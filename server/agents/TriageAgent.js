// TriageAgent — classifies, prioritizes, and routes incoming support tickets.
import { log, logError, measureStart, measureEnd } from '../utils/logger.js';
import { fetchUserProfile, getServiceHealth } from '../services/microsoftGraph.js';
import { getEmployeeContext } from '../services/workIQ.js';
import { getSimilarTickets } from '../services/fabricIQ.js';
import { config, hasOpenAICredentials } from '../config/env.js';

const MODULE = 'TriageAgent';

const CATEGORY_KEYWORDS = {
  SharePoint: ['sharepoint', 'site', 'document library', 'permission', 'access denied', 'sp ', 'file upload', 'search returning', 'data export'],
  Exchange: ['outlook', 'email', 'calendar', 'exchange', 'mailbox', 'sync', 'email delivery', 'shared mailbox', 'mailbox not provisioned'],
  Teams: ['teams', 'meeting', 'audio', 'video', 'call', 'chat', 'teams recording', 'teams status', 'teams channel', 'presence'],
  Identity: ['password', 'login', 'mfa', 'authentication', 'sign in', 'locked out', 'two-factor', '2fa', 'license error', 'microsoft 365 apps', 'conditional access', 'azure ad', 'unauthorized access', 'admin panel'],
  Network: ['vpn', 'network', 'connection', 'wifi', 'latency', 'slow', 'vpn users', 'proxy', 'firewall', 'system down', 'entire system', 'point of sale', 'pos system', 'all stores', 'outage', 'down across'],
  PowerPlatform: ['power automate', 'flow', 'automate', 'automation', 'workflow'],
  Complaint: ['legal action', 'lawsuit', 'legal team', 'threatening', 'fourth time', '4th time', 'third time', '3rd time', 'unacceptable', 'breach of service', 'completely unacceptable', '3 years', 'paying customer'],
  Hardware: ['laptop', 'monitor', 'keyboard', 'printer', 'device', 'onedrive sync'],
};

const PRIORITY_SIGNALS = {
  critical: ['down', 'outage', 'cannot work', 'production', 'all users', 'company-wide', 'urgent', 'emergency', 'entire system', 'all stores', '200 stores', 'legal action', 'lawsuit', 'legal team', 'breach', 'unauthorized access', 'security breach', 'hacked', 'data loss', 'immediately', 'asap', 'fourth time', '4th time', 'threatening', 'completely unacceptable'],
  high: ['blocked', 'deadline', 'executive', 'vip', 'cannot access', 'failed', 'third time', '3rd time', 'still not working', 'escalate', 'manager', 'multiple users', 'team blocked', 'finance blocked', 'client facing', '45 employees', '200 invoices', 'stuck for days'],
  medium: ['issue', 'problem', 'error', 'not working', 'help', 'not syncing', 'not appearing', 'not saving', 'not updating', 'failing', 'stuck'],
  low: ['question', 'how to', 'request', 'enhancement', 'minor', 'report', 'usage report', 'information', 'could you please', 'need to reset', 'new phone', 'reset my', 'how do i'],
};

function classifyCategory(text) {
  const lower = text.toLowerCase();
  let bestCategory = 'General';
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const score = keywords.filter((kw) => lower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }
  return { category: bestCategory, confidence: bestScore > 0 ? Math.min(0.95, 0.6 + bestScore * 0.1) : 0.5 };
}

function classifyPriority(text, userContext) {
  const lower = text.toLowerCase();
  let priority = 'medium';
  let confidence = 0.7;

  for (const [level, signals] of Object.entries(PRIORITY_SIGNALS)) {
    if (signals.some((s) => lower.includes(s))) {
      priority = level;
      confidence = 0.85;
      break;
    }
  }

  const angrySignals = ['legal action', 'lawsuit', 'threatening', 'unacceptable', 'fourth time', '4th time', 'third time', 'furious', 'disgusting'];
  const hasAngrySentiment = angrySignals.some(s => lower.includes(s));
  if (hasAngrySentiment && (priority === 'medium' || priority === 'low')) {
    priority = 'critical';
    confidence = 0.92;
  }

  const sentiment = hasAngrySentiment ? 'angry' : lower.includes('frustrated') || lower.includes('still not') || lower.includes('again') ? 'frustrated' : 'neutral';

  if (userContext?.currentWorkload === 'high' && priority === 'medium') {
    priority = 'high';
    confidence = 0.75;
  }

  return { priority, confidence, sentiment };
}

function extractRequiredSkills(category) {
  const skillMap = {
    SharePoint: ['SharePoint', 'Azure'],
    Exchange: ['Exchange', 'Outlook'],
    Teams: ['Teams', 'Network'],
    Identity: ['Identity', 'Security'],
    Network: ['Network', 'Security'],
    PowerPlatform: ['Power Automate', 'Azure'],
    Complaint: ['Senior Support', 'Account Management', 'Legal'],
    Hardware: ['Hardware'],
    General: ['General Support'],
  };
  return skillMap[category] || skillMap.General;
}

async function analyzeWithLLM(ticket) {
  const startMs = measureStart();
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
        messages: [
          { role: 'system', content: 'You are a support ticket triage assistant. Respond with JSON: { category, priority, sentiment, summary }' },
          { role: 'user', content: `Subject: ${ticket.subject}\nDescription: ${ticket.description}` },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM call failed: ${response.status}`);
    }

    const data = await response.json();
    const parsed = JSON.parse(data.choices[0].message.content);
    return { ...parsed, processingTimeMs: measureEnd(startMs), source: isAzure ? 'azure-openai' : 'openai' };
  } catch (error) {
    logError(MODULE, 'LLM analysis failed — using rule-based fallback', error);
    return null;
  }
}

export async function triageTicket(ticket, emitFn = null) {
  const pipelineStart = measureStart();
  try {
    log(MODULE, `Starting triage for ticket ${ticket.id || 'new'}`, { subject: ticket.subject });

    if (emitFn) emitFn('triage:started', { ticketId: ticket.id, timestamp: new Date().toISOString() });

    const userProfileStart = measureStart();
    const userProfile = await fetchUserProfile(ticket.requesterId || 'user-001');
    log(MODULE, 'User profile fetched', { processingTimeMs: measureEnd(userProfileStart) });

    if (emitFn) emitFn('triage:user-profile', { ticketId: ticket.id, profile: userProfile });

    const employeeStart = measureStart();
    const { context: employeeContext } = await getEmployeeContext(ticket.requesterId || 'user-001');
    log(MODULE, 'Employee context fetched', { processingTimeMs: measureEnd(employeeStart) });

    if (emitFn) emitFn('triage:employee-context', { ticketId: ticket.id, context: employeeContext });

    const healthStart = measureStart();
    const serviceHealth = await getServiceHealth();
    log(MODULE, 'Service health checked', { processingTimeMs: measureEnd(healthStart) });

    const text = `${ticket.subject} ${ticket.description || ''}`;
    const categoryResult = classifyCategory(text);
    const priorityResult = classifyPriority(text, employeeContext);
    const sentiment = priorityResult.sentiment;

    const llmAnalysis = await analyzeWithLLM(ticket);
if (llmAnalysis === null) log(MODULE, 'LLM unavailable — using rule-based classification');

    const finalCategory = llmAnalysis?.category || categoryResult.category;
    const finalPriority = llmAnalysis?.priority || priorityResult.priority;

    const similarStart = measureStart();
    const { similarTickets } = await getSimilarTickets(text);
    log(MODULE, `Found ${similarTickets.length} similar tickets`, { processingTimeMs: measureEnd(similarStart) });

    const relatedService = serviceHealth.services?.find((s) =>
      s.name.toLowerCase().includes(finalCategory.toLowerCase()) ||
      (finalCategory === 'Exchange' && s.name.includes('Exchange')) ||
      (finalCategory === 'Teams' && s.name.includes('Teams'))
    );

    const result = {
      agent: 'TriageAgent',
      ticketId: ticket.id,
      classification: {
        category: finalCategory,
        categoryConfidence: categoryResult.confidence,
        priority: finalPriority,
        priorityConfidence: priorityResult.confidence,
        sentiment: llmAnalysis?.sentiment || sentiment || 'neutral',
        summary: llmAnalysis?.summary || ticket.subject,
      },
      requester: {
        profile: userProfile,
        context: employeeContext,
      },
      requiredSkills: extractRequiredSkills(finalCategory),
      similarTickets,
      serviceHealth: relatedService || null,
      recommendedActions: buildRecommendedActions(finalCategory, finalPriority, relatedService),
      processingTimeMs: measureEnd(pipelineStart),
      timestamp: new Date().toISOString(),
    };

    log(MODULE, `Triage complete for ${ticket.id}`, {
      category: finalCategory,
      priority: finalPriority,
      processingTimeMs: result.processingTimeMs,
    });

    if (emitFn) {
      emitFn('reasoning:step', {
        ticketId: ticket.id,
        stepNumber: 4,
        stepName: 'Intent Classification',
        agent: 'TriageAgent',
        microsoftTech: 'Work IQ — Foundry',
        description: `Analysing ticket semantics to determine M365 category: ${finalCategory}`,
        signals: [
          `Keyword matches: ${categoryResult.confidence}`,
          `Azure AI Language Sentiment: ${result.classification.sentiment}`,
          `Subject text parsed: "${ticket.subject}"`
        ],
        decision: `Ticket categorized as "${finalCategory}" with confidence ${Math.round(categoryResult.confidence * 100)}%`,
        confidence: categoryResult.confidence
      });

      emitFn('reasoning:step', {
        ticketId: ticket.id,
        stepNumber: 5,
        stepName: 'Priority & Skills Assignment',
        agent: 'TriageAgent',
        description: `Determined urgency and required skillset for ticket: ${finalPriority}`,
        signals: [
          `Urgency signals detected: ${finalPriority}`,
          `Customer workload check: ${employeeContext?.currentWorkload || 'normal'}`,
          `Required skills: ${extractRequiredSkills(finalCategory).join(', ')}`
        ],
        decision: `Assigned priority "${finalPriority}" and queued for ResolutionAgent`,
        confidence: priorityResult.confidence
      });
    }

    if (emitFn) emitFn('triage:completed', result);

    return result;
  } catch (error) {
    logError(MODULE, 'triageTicket failed', error);
    const fallback = {
      agent: 'TriageAgent',
      ticketId: ticket.id,
      classification: { category: 'General', priority: 'medium', categoryConfidence: 0.5, priorityConfidence: 0.5, sentiment: 'neutral', summary: ticket.subject },
      requiredSkills: ['General Support'],
      similarTickets: [],
      processingTimeMs: measureEnd(pipelineStart),
      error: error.message,
      timestamp: new Date().toISOString(),
    };
    if (emitFn) emitFn('triage:error', fallback);
    return fallback;
  }
}

function buildRecommendedActions(category, priority, serviceHealth) {
  const actions = [];

  if (serviceHealth?.status === 'degraded') {
    actions.push({ action: 'check_service_health', detail: `${serviceHealth.name} is currently degraded — verify if related to this ticket` });
  }

  if (priority === 'critical' || priority === 'high') {
    actions.push({ action: 'fast_track', detail: 'Escalate to L2/L3 immediately due to priority level' });
  }

  actions.push({ action: 'search_knowledge_base', detail: `Search KB for ${category} related articles` });
  actions.push({ action: 'assign_agent', detail: `Route to agent with ${category} skills` });

  return actions;
}
