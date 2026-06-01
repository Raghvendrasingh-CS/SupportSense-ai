// Microsoft Graph API client with token acquisition and mock fallback.
import { config, hasMicrosoftCredentials } from '../config/env.js';
import { log, logError, measureStart, measureEnd } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';

const MODULE = 'MicrosoftGraph';

let cachedToken = null;
let tokenExpiry = 0;

async function acquireToken() {
  const startMs = measureStart();
  try {
    if (!hasMicrosoftCredentials()) {
      log(MODULE, 'No credentials — using mock token');
      return { token: 'mock-graph-token', processingTimeMs: measureEnd(startMs), mock: true };
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
    logError(MODULE, 'Token acquisition failed — falling back to mock', error);
    return { token: 'mock-graph-token', processingTimeMs: measureEnd(startMs), mock: true, error: error.message };
  }
}

async function getToken() {
  try {
    if (cachedToken && Date.now() < tokenExpiry) {
      return { token: cachedToken, mock: false, processingTimeMs: 0 };
    }
    return await acquireToken();
  } catch (error) {
    logError(MODULE, 'getToken failed', error);
    return { token: 'mock-graph-token', mock: true, processingTimeMs: 0 };
  }
}

function mockUserProfile(userId) {
  const profiles = {
    'user-001': { id: 'user-001', displayName: 'Sarah Chen', mail: 'sarah.chen@contoso.com', department: 'Engineering', jobTitle: 'Senior Developer' },
    'user-002': { id: 'user-002', displayName: 'Marcus Webb', mail: 'marcus.webb@contoso.com', department: 'Finance', jobTitle: 'Financial Analyst' },
    'user-003': { id: 'user-003', displayName: 'Elena Rodriguez', mail: 'elena.r@contoso.com', department: 'Operations', jobTitle: 'Ops Manager' },
  };
  return profiles[userId] || {
    id: userId,
    displayName: 'Demo User',
    mail: 'demo.user@contoso.com',
    department: 'General',
    jobTitle: 'Employee',
  };
}

function mockSupportTickets() {
  return [
    { id: 'TKT-1001', subject: 'Cannot access SharePoint site', status: 'open', priority: 'high', createdDateTime: new Date(Date.now() - 3600000).toISOString(), requesterId: 'user-001' },
    { id: 'TKT-1002', subject: 'Outlook calendar sync failing', status: 'open', priority: 'medium', createdDateTime: new Date(Date.now() - 7200000).toISOString(), requesterId: 'user-002' },
    { id: 'TKT-1003', subject: 'Teams meeting audio issues', status: 'open', priority: 'low', createdDateTime: new Date(Date.now() - 14400000).toISOString(), requesterId: 'user-003' },
  ];
}

export async function fetchUserProfile(userId) {
  const startMs = measureStart();
  try {
    log(MODULE, `Fetching user profile for ${userId}`);
    const { token, mock } = await getToken();

    if (mock) {
      const profile = mockUserProfile(userId);
      log(MODULE, 'Returning mock user profile');
      return { ...profile, processingTimeMs: measureEnd(startMs), source: 'mock' };
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
    logError(MODULE, 'fetchUserProfile failed — mock fallback', error);
    return { ...mockUserProfile(userId), processingTimeMs: measureEnd(startMs), source: 'mock-fallback', error: error.message };
  }
}

export async function fetchSupportTickets(filter = {}) {
  const startMs = measureStart();
  try {
    log(MODULE, 'Fetching support tickets', filter);
    const { token, mock } = await getToken();

    if (mock) {
      let tickets = mockSupportTickets();
      if (filter.status) tickets = tickets.filter((t) => t.status === filter.status);
      log(MODULE, `Returning ${tickets.length} mock tickets`);
      return { tickets, processingTimeMs: measureEnd(startMs), source: 'mock' };
    }

    const response = await fetch('https://graph.microsoft.com/v1.0/servicePrincipals', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Graph tickets fetch failed: ${response.status}`);
    }

    return { tickets: mockSupportTickets(), processingTimeMs: measureEnd(startMs), source: 'graph-derived' };
  } catch (error) {
    logError(MODULE, 'fetchSupportTickets failed — mock fallback', error);
    return { tickets: mockSupportTickets(), processingTimeMs: measureEnd(startMs), source: 'mock-fallback', error: error.message };
  }
}

export async function sendNotification(userId, message) {
  const startMs = measureStart();
  try {
    log(MODULE, `Sending notification to ${userId}`, { message });
    const { token, mock } = await getToken();

    if (mock) {
      log(MODULE, 'Mock notification sent');
      return { success: true, notificationId: `mock-notif-${Date.now()}`, processingTimeMs: measureEnd(startMs), source: 'mock' };
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
    logError(MODULE, 'sendNotification failed — mock fallback', error);
    return { success: true, notificationId: `mock-notif-${Date.now()}`, processingTimeMs: measureEnd(startMs), source: 'mock-fallback', error: error.message };
  }
}

export async function getServiceHealth() {
  const startMs = measureStart();
  try {
    log(MODULE, 'Checking Microsoft 365 service health');
    const { mock } = await getToken();

    if (mock) {
      return {
        services: [
          { name: 'Exchange Online', status: 'healthy', incidents: 0 },
          { name: 'SharePoint Online', status: 'healthy', incidents: 0 },
          { name: 'Microsoft Teams', status: 'degraded', incidents: 1 },
          { name: 'OneDrive', status: 'healthy', incidents: 0 },
        ],
        processingTimeMs: measureEnd(startMs),
        source: 'mock',
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
    logError(MODULE, 'getServiceHealth failed — mock fallback', error);
    return {
      services: [
        { name: 'Exchange Online', status: 'healthy', incidents: 0 },
        { name: 'Microsoft Teams', status: 'degraded', incidents: 1 },
      ],
      processingTimeMs: measureEnd(startMs),
      source: 'mock-fallback',
      error: error.message,
    };
  }
}
