// Work IQ integration for employee context, skills, and workload intelligence.
import { config, hasWorkIQCredentials } from '../config/env.js';
import { log, logError, measureStart, measureEnd } from '../utils/logger.js';

const MODULE = 'WorkIQ';

const MOCK_EMPLOYEE_CONTEXT = {
  'user-001': {
    employeeId: 'user-001',
    displayName: 'Sarah Chen',
    skills: ['Azure', 'SharePoint', 'Power Platform', 'JavaScript'],
    currentWorkload: 'high',
    openTickets: 7,
    avgResolutionTimeHours: 3.2,
    satisfactionScore: 4.6,
    preferredContactMethod: 'Teams',
    timezone: 'America/Los_Angeles',
    managerName: 'David Park',
  },
  'user-002': {
    employeeId: 'user-002',
    displayName: 'Marcus Webb',
    skills: ['Excel', 'Power BI', 'Finance Systems'],
    currentWorkload: 'medium',
    openTickets: 3,
    avgResolutionTimeHours: 2.1,
    satisfactionScore: 4.8,
    preferredContactMethod: 'Email',
    timezone: 'America/New_York',
    managerName: 'Lisa Thompson',
  },
  'user-003': {
    employeeId: 'user-003',
    displayName: 'Elena Rodriguez',
    skills: ['Teams Admin', 'Network', 'Security'],
    currentWorkload: 'low',
    openTickets: 1,
    avgResolutionTimeHours: 1.8,
    satisfactionScore: 4.9,
    preferredContactMethod: 'Teams',
    timezone: 'America/Chicago',
    managerName: 'James Wilson',
  },
};

const MOCK_AGENT_POOL = [
  { id: 'agent-001', name: 'Alex Rivera', skills: ['SharePoint', 'Exchange'], workload: 4, availability: 'available', tier: 'L2' },
  { id: 'agent-002', name: 'Priya Sharma', skills: ['Teams', 'Network'], workload: 6, availability: 'busy', tier: 'L2' },
  { id: 'agent-003', name: 'Tom O\'Brien', skills: ['Identity', 'Security'], workload: 2, availability: 'available', tier: 'L3' },
  { id: 'agent-004', name: 'Kim Nakamura', skills: ['Power Platform', 'Azure'], workload: 3, availability: 'available', tier: 'L2' },
  { id: 'agent-005', name: 'Jordan Lee', skills: ['Exchange', 'Outlook'], workload: 8, availability: 'busy', tier: 'L1' },
];

async function callWorkIQAPI(endpoint, payload) {
  const startMs = measureStart();
  try {
    if (!hasWorkIQCredentials()) {
      throw new Error('Work IQ credentials not configured');
    }

    const response = await fetch(`${config.workIQ.endpoint}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': config.workIQ.apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Work IQ API failed: ${response.status}`);
    }

    const data = await response.json();
    return { data, processingTimeMs: measureEnd(startMs), source: 'workiq' };
  } catch (error) {
    logError(MODULE, `callWorkIQAPI ${endpoint} failed`, error);
    throw error;
  }
}

export async function getEmployeeContext(employeeId) {
  const startMs = measureStart();
  try {
    log(MODULE, `Fetching employee context for ${employeeId}`);

    if (!hasWorkIQCredentials()) {
      const context = MOCK_EMPLOYEE_CONTEXT[employeeId] || {
        employeeId,
        displayName: 'Unknown Employee',
        skills: [],
        currentWorkload: 'unknown',
        openTickets: 0,
        avgResolutionTimeHours: 0,
        satisfactionScore: 0,
        preferredContactMethod: 'Email',
        timezone: 'UTC',
        managerName: 'N/A',
      };
      log(MODULE, 'Returning mock employee context');
      return { context, processingTimeMs: measureEnd(startMs), source: 'mock' };
    }

    const { data, processingTimeMs } = await callWorkIQAPI('/employees/context', { employeeId });
    return { context: data, processingTimeMs, source: 'workiq' };
  } catch (error) {
    logError(MODULE, 'getEmployeeContext failed — mock fallback', error);
    const context = MOCK_EMPLOYEE_CONTEXT[employeeId] || MOCK_EMPLOYEE_CONTEXT['user-001'];
    return { context, processingTimeMs: measureEnd(startMs), source: 'mock-fallback', error: error.message };
  }
}

export async function findBestAgent(requiredSkills, priority = 'medium') {
  const startMs = measureStart();
  try {
    log(MODULE, 'Finding best available agent', { requiredSkills, priority });

    if (!hasWorkIQCredentials()) {
      const scored = MOCK_AGENT_POOL.map((agent) => {
        const skillMatch = requiredSkills.filter((s) =>
          agent.skills.some((as) => as.toLowerCase().includes(s.toLowerCase()))
        ).length;
        const skillScore = skillMatch / Math.max(requiredSkills.length, 1);
        const workloadScore = 1 - agent.workload / 10;
        const availabilityScore = agent.availability === 'available' ? 1 : 0.3;
        const tierScore = priority === 'critical' ? (agent.tier === 'L3' ? 1 : 0.5) : 0.7;
        const totalScore = skillScore * 0.4 + workloadScore * 0.3 + availabilityScore * 0.2 + tierScore * 0.1;
        return { ...agent, matchScore: Math.round(totalScore * 100) / 100 };
      }).sort((a, b) => b.matchScore - a.matchScore);

      const bestAgent = scored[0];
      log(MODULE, `Best agent: ${bestAgent.name} (score: ${bestAgent.matchScore})`);
      return { agent: bestAgent, alternatives: scored.slice(1, 3), processingTimeMs: measureEnd(startMs), source: 'mock' };
    }

    const { data, processingTimeMs } = await callWorkIQAPI('/agents/match', { requiredSkills, priority });
    return { agent: data.bestAgent, alternatives: data.alternatives, processingTimeMs, source: 'workiq' };
  } catch (error) {
    logError(MODULE, 'findBestAgent failed — mock fallback', error);
    const agent = MOCK_AGENT_POOL.find((a) => a.availability === 'available') || MOCK_AGENT_POOL[0];
    return { agent: { ...agent, matchScore: 0.75 }, alternatives: [], processingTimeMs: measureEnd(startMs), source: 'mock-fallback', error: error.message };
  }
}

export async function getWorkloadInsights() {
  const startMs = measureStart();
  try {
    log(MODULE, 'Fetching workload insights');

    if (!hasWorkIQCredentials()) {
      const insights = {
        totalAgents: MOCK_AGENT_POOL.length,
        availableAgents: MOCK_AGENT_POOL.filter((a) => a.availability === 'available').length,
        avgWorkload: Math.round(MOCK_AGENT_POOL.reduce((s, a) => s + a.workload, 0) / MOCK_AGENT_POOL.length * 10) / 10,
        peakHours: ['09:00', '14:00'],
        recommendedStaffing: { L1: 2, L2: 3, L3: 1 },
        agentPool: MOCK_AGENT_POOL,
      };
      return { insights, processingTimeMs: measureEnd(startMs), source: 'mock' };
    }

    const { data, processingTimeMs } = await callWorkIQAPI('/insights/workload', {});
    return { insights: data, processingTimeMs, source: 'workiq' };
  } catch (error) {
    logError(MODULE, 'getWorkloadInsights failed — mock fallback', error);
    return {
      insights: {
        totalAgents: MOCK_AGENT_POOL.length,
        availableAgents: 3,
        avgWorkload: 4.6,
        peakHours: ['09:00', '14:00'],
        recommendedStaffing: { L1: 2, L2: 3, L3: 1 },
        agentPool: MOCK_AGENT_POOL,
      },
      processingTimeMs: measureEnd(startMs),
      source: 'mock-fallback',
      error: error.message,
    };
  }
}

export async function predictResolutionTime(category, priority, agentTier = 'L2') {
  const startMs = measureStart();
  try {
    log(MODULE, 'Predicting resolution time', { category, priority, agentTier });

    const baseHours = { SharePoint: 4.2, Exchange: 3.1, Teams: 2.8, Identity: 1.5, Network: 6.7, General: 4.0 };
    const priorityMultiplier = { critical: 0.5, high: 0.7, medium: 1.0, low: 1.3 };
    const tierMultiplier = { L1: 1.4, L2: 1.0, L3: 0.7 };

    const base = baseHours[category] || baseHours.General;
    const predictedHours = Math.round(base * (priorityMultiplier[priority] || 1) * (tierMultiplier[agentTier] || 1) * 10) / 10;

    if (!hasWorkIQCredentials()) {
      return {
        predictedHours,
        confidence: 0.82,
        factors: ['Historical category average', 'Priority weighting', 'Agent tier capability'],
        processingTimeMs: measureEnd(startMs),
        source: 'mock',
      };
    }

    const { data, processingTimeMs } = await callWorkIQAPI('/predict/resolution-time', { category, priority, agentTier });
    return { ...data, processingTimeMs, source: 'workiq' };
  } catch (error) {
    logError(MODULE, 'predictResolutionTime failed — mock fallback', error);
    return {
      predictedHours: 4.0,
      confidence: 0.75,
      factors: ['Fallback estimate'],
      processingTimeMs: measureEnd(startMs),
      source: 'mock-fallback',
      error: error.message,
    };
  }
}
