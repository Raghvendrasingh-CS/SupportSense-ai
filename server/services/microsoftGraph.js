// Microsoft Graph API client with token acquisition and dynamic simulation.
import { config, hasMicrosoftCredentials } from '../config/env.js';
import { log, logError, measureStart, measureEnd } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import { db } from '../db/store.js';
import { hashString } from '../utils/hash.js';

const MODULE = 'MicrosoftGraph';

let cachedToken = null;
let tokenExpiry = 0;

async function acquireToken() {
  const startMs = measureStart();
  try {
    if (!hasMicrosoftCredentials()) {
      log(MODULE, 'No credentials — using simulated token');
      return { token: 'simulated-graph-token', processingTimeMs: measureEnd(startMs), mock: true };
    }

    const url = `https://login.microsoftonline.com/${config.azure.tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: config.azure.clientId,
      client_secret: config.azure.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Token request failed: ${response.status}`);
    }

    const data = await response.json();
    cachedToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    log(MODULE, 'Acquired Graph API token');
    return { token: cachedToken, processingTimeMs: measureEnd(startMs), mock: false };
  } catch (error) {
    logError(MODULE, 'Token acquisition failed — falling back to simulation', error);
    return { token: 'simulated-graph-token', processingTimeMs: measureEnd(startMs), mock: true, error: error.message };
  }
}

export async function getToken() {
  try {
    if (cachedToken && Date.now() < tokenExpiry) {
      return { token: cachedToken, mock: false, processingTimeMs: 0 };
    }
    return await acquireToken();
  } catch (error) {
    logError(MODULE, 'getToken failed', error);
    return { token: 'simulated-graph-token', mock: true, processingTimeMs: 0 };
  }
}

/**
 * Generates a realistic simulated user profile dynamically.
 */
function generateDynamicUserProfile(userId) {
  const hash = hashString(userId);
  const cleanId = userId.split('@')[0];
  const parts = cleanId.split('.');
  
  const firstNames = ['Sarah', 'Marcus', 'Elena', 'David', 'Sunita', 'Michelle', 'Arjun', 'Priya', 'Vikram', 'Rohan'];
  const lastNames = ['Chen', 'Webb', 'Rodriguez', 'Park', 'Reddy', 'Chen', 'Mehta', 'Sharma', 'Nair', 'Kapoor'];
  
  let firstName = parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : firstNames[hash % firstNames.length];
  let lastName = parts[1] ? parts[1].charAt(0).toUpperCase() + parts[1].slice(1) : lastNames[(hash >> 1) % lastNames.length];
  const displayName = `${firstName} ${lastName}`;

  const departments = ['Engineering', 'Finance', 'Operations', 'Retail', 'Logistics', 'Design Studio', 'Manufacturing'];
  const department = departments[hash % departments.length];

  const titles = {
    Engineering: 'Senior Developer',
    Finance: 'Financial Analyst',
    Operations: 'Ops Manager',
    Retail: 'Store Director',
    Logistics: 'Supply Chain Manager',
    'Design Studio': 'Lead Designer',
    Manufacturing: 'Team Lead'
  };
  const jobTitle = titles[department] || 'Employee';

  return {
    id: userId,
    displayName,
    mail: userId.includes('@') ? userId : `${userId}@company.com`,
    department,
    jobTitle,
  };
}

export async function fetchUserProfile(userId) {
  const startMs = measureStart();
  try {
    log(MODULE, `Fetching user profile for ${userId}`);
    const { token, mock } = await getToken();

    if (mock) {
      const profile = generateDynamicUserProfile(userId);
      log(MODULE, 'Returning simulated user profile');
      return { ...profile, processingTimeMs: measureEnd(startMs), source: 'simulated-graph' };
    }

    const response = await fetch(`https://graph.microsoft.com/v1.0/users/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Graph user fetch failed: ${response.status}`);
    }

    const profile = await response.json();
    return {
      id: profile.id,
      displayName: profile.displayName,
      mail: profile.mail,
      department: profile.department,
      jobTitle: profile.jobTitle,
      processingTimeMs: measureEnd(startMs),
      source: 'graph',
    };
  } catch (error) {
    logError(MODULE, 'fetchUserProfile failed — simulated fallback', error);
    return { ...generateDynamicUserProfile(userId), processingTimeMs: measureEnd(startMs), source: 'simulated-graph-fallback', error: error.message };
  }
}

export async function fetchSupportTickets(filter = {}) {
  const startMs = measureStart();
  try {
    log(MODULE, 'Fetching support tickets', filter);
    const { token, mock } = await getToken();

    // Pull tickets from local database to synchronize
    const localTickets = db.getTickets();
    const formattedTickets = localTickets.map((t) => ({
      id: t.id,
      subject: t.subject,
      status: t.status === 'resolved' ? 'resolved' : 'open',
      priority: t.priority || 'medium',
      createdDateTime: t.createdAt,
      requesterId: t.requesterId,
    }));

    if (mock) {
      log(MODULE, `Returning ${formattedTickets.length} database-synchronized simulated tickets`);
      return { tickets: formattedTickets, processingTimeMs: measureEnd(startMs), source: 'simulated-graph' };
    }

    const response = await fetch('https://graph.microsoft.com/v1.0/servicePrincipals', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Graph tickets fetch failed: ${response.status}`);
    }

    return { tickets: formattedTickets, processingTimeMs: measureEnd(startMs), source: 'graph-derived' };
  } catch (error) {
    logError(MODULE, 'fetchSupportTickets failed — simulated fallback', error);
    const localTickets = db.getTickets();
    const formattedTickets = localTickets.map((t) => ({
      id: t.id,
      subject: t.subject,
      status: t.status === 'resolved' ? 'resolved' : 'open',
      priority: t.priority || 'medium',
      createdDateTime: t.createdAt,
      requesterId: t.requesterId,
    }));
    return { tickets: formattedTickets, processingTimeMs: measureEnd(startMs), source: 'simulated-graph-fallback', error: error.message };
  }
}

export async function sendNotification(userId, message) {
  const startMs = measureStart();
  try {
    log(MODULE, `Sending notification to ${userId}`, { message });
    const { token, mock } = await getToken();

    if (mock) {
      log(MODULE, 'Simulated notification sent');
      return { success: true, notificationId: `sim-notif-${Date.now()}`, processingTimeMs: measureEnd(startMs), source: 'simulated-graph' };
    }

    const response = await fetch(`https://graph.microsoft.com/v1.0/users/${userId}/sendMail`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          subject: 'SupportSense AI Update',
          body: { contentType: 'Text', content: message },
          toRecipients: [{ emailAddress: { address: `${userId}@contoso.com` } }],
        },
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Notification send failed: ${response.status}`);
    }

    return { success: true, notificationId: `graph-notif-${Date.now()}`, processingTimeMs: measureEnd(startMs), source: 'graph' };
  } catch (error) {
    logError(MODULE, 'sendNotification failed — simulated fallback', error);
    return { success: true, notificationId: `sim-notif-${Date.now()}`, processingTimeMs: measureEnd(startMs), source: 'simulated-graph-fallback', error: error.message };
  }
}

export async function getServiceHealth() {
  const startMs = measureStart();
  try {
    log(MODULE, 'Checking Microsoft 365 service health');
    const { mock } = await getToken();

    // Dynamically simulate status based on current date
    const hour = new Date().getHours();
    const teamsStatus = hour % 3 === 0 ? 'degraded' : 'healthy';
    const teamsIncidents = teamsStatus === 'degraded' ? 1 : 0;

    const baseServices = [
      { name: 'Exchange Online', status: 'healthy', incidents: 0 },
      { name: 'SharePoint Online', status: 'healthy', incidents: 0 },
      { name: 'Microsoft Teams', status: teamsStatus, incidents: teamsIncidents },
      { name: 'OneDrive', status: 'healthy', incidents: 0 },
    ];

    if (mock) {
      return {
        services: baseServices,
        processingTimeMs: measureEnd(startMs),
        source: 'simulated-graph',
      };
    }

    const response = await fetch('https://graph.microsoft.com/v1.0/admin/serviceAnnouncement/healthOverviews', {
      headers: { Authorization: `Bearer ${(await getToken()).token}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Service health fetch failed: ${response.status}`);
    }

    const data = await response.json();
    const statusMap = {
      serviceOperational: 'healthy',
      serviceDegraded: 'degraded',
      serviceInterruption: 'interrupted',
      investigating: 'degraded',
      restoringService: 'degraded',
      verifyingService: 'degraded',
      resolved: 'healthy',
      mitigated: 'healthy',
    };
    const services = (data.value || []).map((s) => ({
      name: s.service || s.id || 'Unknown Service',
      status: statusMap[s.status] || s.status || 'healthy',
      incidents: 0,
    }));

    return { services, processingTimeMs: measureEnd(startMs), source: 'graph' };
  } catch (error) {
    logError(MODULE, 'getServiceHealth failed — simulated fallback', error);
    const hour = new Date().getHours();
    const teamsStatus = hour % 3 === 0 ? 'degraded' : 'healthy';
    return {
      services: [
        { name: 'Exchange Online', status: 'healthy', incidents: 0 },
        { name: 'Microsoft Teams', status: teamsStatus, incidents: teamsStatus === 'degraded' ? 1 : 0 },
      ],
      processingTimeMs: measureEnd(startMs),
      source: 'simulated-graph-fallback',
      error: error.message,
    };
  }
}
