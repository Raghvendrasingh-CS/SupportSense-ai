// TriageAgent — classifies, prioritizes, and routes incoming support tickets.
import { log, logError, measureStart, measureEnd } from '../utils/logger.js';
import { fetchUserProfile, getServiceHealth } from '../services/microsoftGraph.js';
import { getEmployeeContext } from '../services/workIQ.js';
import { getSimilarTickets } from '../services/fabricIQ.js';
import { config, hasOpenAICredentials } from '../config/env.js';

const MODULE = 'TriageAgent';

const CATEGORY_KEYWORDS = {
  SharePoint: ['sharepoint', 'site', 'document library', 'permission', 'access denied', 'sp '],
  Exchange: ['outlook', 'email', 'calendar', 'exchange', 'mailbox', 'sync'],
  Teams: ['teams', 'meeting', 'audio', 'video', 'call', 'chat'],
  Identity: ['password', 'login', 'mfa', 'authentication', 'sign in', 'locked out'],
  Network: ['vpn', 'network', 'connection', 'wifi', 'latency', 'slow'],
  Hardware: ['laptop', 'monitor', 'keyboard', 'printer', 'device'],
};

const PRIORITY_SIGNALS = {
  critical: ['down', 'outage', 'cannot work', 'production', 'all users', 'company-wide', 'urgent'],
  high: ['blocked', 'deadline', 'executive', 'vip', 'cannot access', 'failed'],
  medium: ['issue', 'problem', 'error', 'not working', 'help'],
  low: ['question', 'how to', 'request', 'enhancement', 'minor'],
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

  if (userContext?.currentWorkload === 'high' && priority === 'medium') {
    priority = 'high';
    confidence = 0.75;
  }

  return { priority, confidence };
}

function extractRequiredSkills(category) {
  const skillMap = {
    SharePoint: ['SharePoint', 'Azure'],
    Exchange: ['Exchange', 'Outlook'],
    Teams: ['Teams', 'Network'],
    Identity: ['Identity', 'Security'],
    Network: ['Network', 'Security'],
    Hardware: ['Hardware'],
    General: ['General Support'],
  };
  return skillMap[category] || skillMap.General;
}

async function analyzeWithLLM(ticket) {
  const startMs = measureStart();
  try {
    if (!hasOpenAICredentials()) {
      return null;
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openai.apiKey}`,
      },
      body: JSON.stringify({
        model: config.openai.model,
        messages: [
          { role: 'system', content: 'You are a support ticket triage assistant. Respond with JSON: { category, priority, sentiment, summary }' },
          { role: 'user', content: `Subject: ${ticket.subject}\nDescription: ${ticket.description}` },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API failed: ${response.status}`);
    }

    const data = await response.json();
    const parsed = JSON.parse(data.choices[0].message.content);
    return { ...parsed, processingTimeMs: measureEnd(startMs), source: 'openai' };
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

    const llmAnalysis = await analyzeWithLLM(ticket);

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
        sentiment: llmAnalysis?.sentiment || 'neutral',
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
