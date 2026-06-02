// Microsoft 365 Work Intelligence — uses Microsoft Graph API for employee context and Azure AD for agent skill routing.
import { config, hasMicrosoftCredentials } from '../config/env.js';
import { log, logError, measureStart, measureEnd } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import { getToken } from './microsoftGraph.js';
import { hashString } from '../utils/hash.js';

const MODULE = 'WorkIQ';

// Seed names for synthetic agent generation
const FIRST_NAMES = ['Jordan', 'Taylor', 'Alex', 'Morgan', 'Sam', 'Jamie', 'Chris', 'Pat', 'Casey', 'Robin'];
const LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'];

async function callGraphAPI(graphUrl) {
  const startMs = measureStart();
  try {
    if (!hasMicrosoftCredentials()) {
      throw new Error('Microsoft Graph credentials not configured');
    }

    const { token } = await getToken();

    const response = await fetch(graphUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Microsoft Graph API failed: ${response.status}`);
    }

    const data = await response.json();
    return { data, processingTimeMs: measureEnd(startMs), source: 'graph' };
  } catch (error) {
    logError(MODULE, `callGraphAPI ${graphUrl} failed`, error);
    throw error;
  }
}

/**
 * Generate a highly realistic user profile based on their email or ID.
 */
function generateSyntheticEmployee(employeeId) {
  const hash = hashString(employeeId);
  const cleanId = employeeId.split('@')[0];
  const parts = cleanId.split('.');
  
  let firstName = parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : FIRST_NAMES[hash % FIRST_NAMES.length];
  let lastName = parts[1] ? parts[1].charAt(0).toUpperCase() + parts[1].slice(1) : LAST_NAMES[(hash >> 2) % LAST_NAMES.length];
  const displayName = `${firstName} ${lastName}`;

  const departments = ['Engineering', 'Finance', 'Operations', 'Sales', 'Human Resources', 'Legal', 'Marketing'];
  const department = departments[hash % departments.length];

  const titles = {
    Engineering: ['Software Engineer', 'Senior Developer', 'DevOps Specialist', 'Systems Architect'],
    Finance: ['Financial Analyst', 'Senior Accountant', 'Finance Director'],
    Operations: ['Operations Lead', 'Operations Manager', 'Facilities Coordinator'],
    Sales: ['Account Executive', 'Sales Manager', 'Customer Success Manager'],
    'Human Resources': ['HR Specialist', 'Recruiter', 'HR Director'],
    Legal: ['Legal Counsel', 'Compliance Officer', 'Paralegal'],
    Marketing: ['Marketing Specialist', 'Brand Manager', 'SEO Analyst']
  };
  const jobTitle = titles[department][(hash >> 3) % titles[department].length];

  const contactMethods = ['Teams', 'Email', 'Phone'];
  const preferredContactMethod = contactMethods[hash % contactMethods.length];

  const timezones = ['America/Los_Angeles', 'America/New_York', 'America/Chicago', 'Europe/London', 'Asia/Kolkata'];
  const timezone = timezones[(hash >> 4) % timezones.length];

  const skillPool = ['Azure', 'SharePoint', 'Teams', 'Power Automate', 'Identity', 'Security', 'Excel', 'Office 365'];
  const skills = [];
  for (let i = 0; i < 3; i++) {
    const skill = skillPool[(hash + i) % skillPool.length];
    if (!skills.includes(skill)) skills.push(skill);
  }

  const workloads = ['low', 'medium', 'high'];
  const currentWorkload = workloads[hash % workloads.length];
  const openTickets = (hash % 6) + 1;
  const avgResolutionTimeHours = Math.round((1.5 + (hash % 4) * 0.7) * 10) / 10;
  const satisfactionScore = Math.round((4.2 + (hash % 9) * 0.1) * 10) / 10;

  const managers = ['David Park', 'Lisa Thompson', 'James Wilson', 'Sarah Jenkins'];
  const managerName = managers[(hash >> 5) % managers.length];

  return {
    employeeId,
    displayName,
    mail: employeeId.includes('@') ? employeeId : `${employeeId}@company.com`,
    department,
    jobTitle,
    skills,
    currentWorkload,
    openTickets,
    avgResolutionTimeHours,
    satisfactionScore,
    preferredContactMethod,
    timezone,
    managerName
  };
}

/**
 * Generate a dynamic pool of support agents matching the required skills.
 */
function generateDynamicAgentPool(requiredSkills, hashSeed) {
  const pool = [];
  const count = 5;

  for (let i = 0; i < count; i++) {
    const idx = (hashSeed + i) % 100;
    const name = `${FIRST_NAMES[idx % FIRST_NAMES.length]} ${LAST_NAMES[(idx >> 1) % LAST_NAMES.length]}`;
    const agentId = `agent-00${i + 1}`;
    
    // Determine skills
    const skills = [...requiredSkills];
    const extraSkills = ['Azure', 'SharePoint', 'Teams', 'Outlook', 'Identity', 'Security', 'Network'];
    while (skills.length < 3) {
      const extra = extraSkills[(idx + skills.length) % extraSkills.length];
      if (!skills.includes(extra)) skills.push(extra);
    }

    const workload = (idx % 8) + 1;
    const availability = workload > 6 ? 'busy' : 'available';
    const tier = idx % 3 === 0 ? 'L3' : 'L2';

    pool.push({
      id: agentId,
      name,
      skills,
      workload,
      availability,
      tier
    });
  }

  return pool;
}

export async function getEmployeeContext(employeeId) {
  const startMs = measureStart();
  try {
    log(MODULE, `Fetching employee context for ${employeeId}`);

    if (!hasMicrosoftCredentials()) {
      const context = generateSyntheticEmployee(employeeId);
      log(MODULE, 'Returning simulated dynamic employee context');
      return { context, processingTimeMs: measureEnd(startMs), source: 'simulated-workiq' };
    }

    const graphUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(employeeId)}?$select=id,displayName,jobTitle,department,officeLocation,userPrincipalName`;
    const { data, processingTimeMs } = await callGraphAPI(graphUrl);
    
    // Supplement graph details with synthetic values for missing schemas
    const baseProfile = generateSyntheticEmployee(employeeId);
    const context = {
      ...baseProfile,
      employeeId: data.id || employeeId,
      displayName: data.displayName || baseProfile.displayName,
      department: data.department || baseProfile.department,
      jobTitle: data.jobTitle || baseProfile.jobTitle,
      mail: data.userPrincipalName || baseProfile.mail,
    };
    return { context, processingTimeMs, source: 'graph' };
  } catch (error) {
    logError(MODULE, 'getEmployeeContext failed — simulated fallback', error);
    const context = generateSyntheticEmployee(employeeId);
    return { context, processingTimeMs: measureEnd(startMs), source: 'simulated-workiq-fallback', error: error.message };
  }
}

export async function findBestAgent(requiredSkills, priority = 'medium') {
  const startMs = measureStart();
  try {
    log(MODULE, 'Finding best available agent', { requiredSkills, priority });

    const seed = hashString(requiredSkills.join('-'));
    const agentPool = generateDynamicAgentPool(requiredSkills, seed);

    const scored = agentPool.map((agent) => {
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

    if (!hasMicrosoftCredentials()) {
      log(MODULE, `Best simulated agent: ${bestAgent.name} (score: ${bestAgent.matchScore})`);
      return { agent: bestAgent, alternatives: scored.slice(1, 3), processingTimeMs: measureEnd(startMs), source: 'simulated-workiq' };
    }

    const graphUrl = `https://graph.microsoft.com/v1.0/users?$filter=department eq '${encodeURIComponent(requiredSkills[0] || 'Support')}'&$select=id,displayName,jobTitle`;
    const { data, processingTimeMs } = await callGraphAPI(graphUrl);
    const users = data.value || [];
    
    const agent = users.length > 0
      ? { id: users[0].id, name: users[0].displayName, skills: requiredSkills, workload: 3, availability: 'available', tier: priority === 'critical' ? 'L3' : 'L2', matchScore: 0.85 }
      : bestAgent;

    return { agent, alternatives: scored.slice(1, 3), processingTimeMs, source: 'graph' };
  } catch (error) {
    logError(MODULE, 'findBestAgent failed — simulated fallback', error);
    const agentPool = generateDynamicAgentPool(requiredSkills, 42);
    const agent = agentPool.find((a) => a.availability === 'available') || agentPool[0];
    return { agent: { ...agent, matchScore: 0.75 }, alternatives: [], processingTimeMs: measureEnd(startMs), source: 'simulated-workiq-fallback', error: error.message };
  }
}

export async function getWorkloadInsights() {
  const startMs = measureStart();
  try {
    log(MODULE, 'Fetching workload insights');

    const requiredSkills = ['Exchange', 'SharePoint', 'Teams', 'Identity', 'Network'];
    const agentPool = generateDynamicAgentPool(requiredSkills, 77);

    const insights = {
      totalAgents: agentPool.length,
      availableAgents: agentPool.filter((a) => a.availability === 'available').length,
      avgWorkload: Math.round(agentPool.reduce((s, a) => s + a.workload, 0) / agentPool.length * 10) / 10,
      peakHours: ['09:00', '14:00'],
      recommendedStaffing: { L1: 2, L2: 3, L3: 1 },
      agentPool: agentPool,
    };

    if (!hasMicrosoftCredentials()) {
      return { insights, processingTimeMs: measureEnd(startMs), source: 'simulated-workiq' };
    }

    const graphUrl = 'https://graph.microsoft.com/v1.0/users?$select=id,displayName,jobTitle,department&$top=10';
    const { data, processingTimeMs } = await callGraphAPI(graphUrl);
    const users = data.value || [];
    
    if (users.length > 0) {
      insights.totalAgents = users.length;
      insights.agentPool = users.map((u, i) => ({
        id: u.id,
        name: u.displayName,
        skills: [u.department || 'General'],
        workload: Math.floor(hashString(u.id + 'workload') % 8) + 1,
        availability: i % 3 === 0 ? 'busy' : 'available',
        tier: i < 2 ? 'L3' : 'L2'
      }));
      insights.availableAgents = insights.agentPool.filter(a => a.availability === 'available').length;
      insights.avgWorkload = Math.round(insights.agentPool.reduce((s, a) => s + a.workload, 0) / insights.agentPool.length * 10) / 10;
    }

    return { insights, processingTimeMs, source: 'graph' };
  } catch (error) {
    logError(MODULE, 'getWorkloadInsights failed — simulated fallback', error);
    const agentPool = generateDynamicAgentPool(['Exchange', 'SharePoint', 'Teams'], 99);
    const insights = {
      totalAgents: agentPool.length,
      availableAgents: agentPool.filter((a) => a.availability === 'available').length,
      avgWorkload: 4.6,
      peakHours: ['09:00', '14:00'],
      recommendedStaffing: { L1: 2, L2: 3, L3: 1 },
      agentPool,
    };
    return {
      insights,
      processingTimeMs: measureEnd(startMs),
      source: 'simulated-workiq-fallback',
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

    return {
      predictedHours,
      confidence: 0.85,
      factors: ['Historical category average', 'Priority weighting', 'Agent tier capability'],
      processingTimeMs: measureEnd(startMs),
      source: 'local-model',
    };
  } catch (error) {
    logError(MODULE, 'predictResolutionTime failed — simulated fallback', error);
    return {
      predictedHours: 4.0,
      confidence: 0.75,
      factors: ['Fallback estimate'],
      processingTimeMs: measureEnd(startMs),
      source: 'simulated-workiq-fallback',
      error: error.message,
    };
  }
}
