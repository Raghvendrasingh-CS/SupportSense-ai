// Microsoft Fabric IQ integration for ticket analytics and knowledge retrieval.
import { config, hasFabricCredentials } from '../config/env.js';
import { log, logError, measureStart, measureEnd } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';

const MODULE = 'FabricIQ';

const MOCK_KNOWLEDGE_BASE = [
  { id: 'kb-001', title: 'SharePoint Access Denied — Resolution Steps', category: 'SharePoint', relevanceScore: 0.94, content: 'Verify site permissions, check group membership, clear browser cache, re-authenticate via portal.office.com' },
  { id: 'kb-002', title: 'Outlook Calendar Sync Troubleshooting', category: 'Exchange', relevanceScore: 0.89, content: 'Reset sync folders, verify autodiscover, check cached mode settings, rebuild OST file' },
  { id: 'kb-003', title: 'Teams Audio/Video Quality Issues', category: 'Teams', relevanceScore: 0.87, content: 'Check network bandwidth, update Teams client, verify device permissions, test with Teams admin diagnostics' },
  { id: 'kb-004', title: 'Password Reset Self-Service Guide', category: 'Identity', relevanceScore: 0.82, content: 'Use aka.ms/sspr, verify MFA methods, contact helpdesk if locked out after 5 attempts' },
  { id: 'kb-005', title: 'VPN Connection Failures', category: 'Network', relevanceScore: 0.78, content: 'Verify credentials, check VPN client version, ensure split tunneling config, test alternate gateway' },
];

const MOCK_ANALYTICS = {
  ticketVolumeTrend: [
    { date: '2025-05-25', count: 42 },
    { date: '2025-05-26', count: 38 },
    { date: '2025-05-27', count: 55 },
    { date: '2025-05-28', count: 47 },
    { date: '2025-05-29', count: 61 },
    { date: '2025-05-30', count: 53 },
    { date: '2025-05-31', count: 49 },
  ],
  categoryBreakdown: [
    { category: 'SharePoint', count: 89, avgResolutionHours: 4.2 },
    { category: 'Exchange', count: 67, avgResolutionHours: 3.1 },
    { category: 'Teams', count: 54, avgResolutionHours: 2.8 },
    { category: 'Identity', count: 41, avgResolutionHours: 1.5 },
    { category: 'Network', count: 33, avgResolutionHours: 6.7 },
  ],
  slaCompliance: 94.2,
  avgFirstResponseMinutes: 12.4,
  avgResolutionHours: 3.8,
};

async function queryFabricLakehouse(sql, params = []) {
  const startMs = measureStart();
  try {
    if (!hasFabricCredentials()) {
      throw new Error('Fabric credentials not configured');
    }

    const url = `https://api.fabric.microsoft.com/v1/workspaces/${config.fabric.workspaceId}/lakehouses/${config.fabric.lakehouseId}/query`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.FABRIC_ACCESS_TOKEN || ''}`,
      },
      body: JSON.stringify({ query: sql, parameters: params }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Fabric query failed: ${response.status}`);
    }

    const data = await response.json();
    return { data, processingTimeMs: measureEnd(startMs), source: 'fabric' };
  } catch (error) {
    logError(MODULE, 'queryFabricLakehouse failed', error);
    throw error;
  }
}

function scoreRelevance(query, article) {
  const q = query.toLowerCase();
  const title = article.title.toLowerCase();
  const category = article.category.toLowerCase();
  let score = article.relevanceScore;
  const queryWords = q.split(' ');

  if (queryWords.some(w => title.includes(w))) {
    score = Math.min(0.99, score + 0.05);
  }

  const categoryMap = {
    sharepoint: ['sharepoint', 'site', 'permission', 'document'],
    exchange: ['outlook', 'email', 'calendar', 'mailbox'],
    teams: ['teams', 'meeting', 'audio', 'video'],
    identity: ['password', 'mfa', 'login', 'authentication', 'locked'],
    network: ['vpn', 'network', 'connection']
  };

  const articleCategoryWords = categoryMap[category] || [];
  const queryMatchesCategory = articleCategoryWords.some(w => q.includes(w));

  if (!queryMatchesCategory) {
    score = score * 0.5;
  }

  return Math.min(0.99, score);
}

export async function searchKnowledgeBase(query, limit = 5) {
  const startMs = measureStart();
  try {
    log(MODULE, `Searching knowledge base: "${query}"`);

    if (!hasFabricCredentials()) {
      const results = MOCK_KNOWLEDGE_BASE
        .map((article) => ({ ...article, relevanceScore: scoreRelevance(query, article) }))
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, limit);

      log(MODULE, `Mock KB search returned ${results.length} results`);
      return { results, processingTimeMs: measureEnd(startMs), source: 'mock' };
    }

    const sql = 'SELECT TOP ? id, title, category, content, relevance_score FROM knowledge_base WHERE CONTAINS(content, ?) ORDER BY relevance_score DESC';
    const { data, processingTimeMs } = await queryFabricLakehouse(sql, [limit, query]);
    return { results: data.rows || MOCK_KNOWLEDGE_BASE.slice(0, limit), processingTimeMs, source: 'fabric' };
  } catch (error) {
    logError(MODULE, 'searchKnowledgeBase failed — mock fallback', error);
    const results = MOCK_KNOWLEDGE_BASE
      .map((article) => ({ ...article, relevanceScore: scoreRelevance(query, article) }))
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit);
    return { results, processingTimeMs: measureEnd(startMs), source: 'mock-fallback', error: error.message };
  }
}

export async function getTicketAnalytics() {
  const startMs = measureStart();
  try {
    log(MODULE, 'Fetching ticket analytics from Fabric');

    if (!hasFabricCredentials()) {
      log(MODULE, 'Returning mock analytics');
      return { analytics: MOCK_ANALYTICS, processingTimeMs: measureEnd(startMs), source: 'mock' };
    }

    const sql = 'SELECT date, ticket_count FROM ticket_volume_daily ORDER BY date DESC LIMIT 7';
    const { data, processingTimeMs } = await queryFabricLakehouse(sql);
    return {
      analytics: { ...MOCK_ANALYTICS, ticketVolumeTrend: data.rows || MOCK_ANALYTICS.ticketVolumeTrend },
      processingTimeMs,
      source: 'fabric',
    };
  } catch (error) {
    logError(MODULE, 'getTicketAnalytics failed — mock fallback', error);
    return { analytics: MOCK_ANALYTICS, processingTimeMs: measureEnd(startMs), source: 'mock-fallback', error: error.message };
  }
}

export async function logTicketEvent(ticketId, eventType, metadata = {}) {
  const startMs = measureStart();
  try {
    log(MODULE, `Logging ticket event: ${eventType} for ${ticketId}`, metadata);

    if (!hasFabricCredentials()) {
      return {
        eventId: `mock-event-${Date.now()}`,
        ticketId,
        eventType,
        metadata,
        processingTimeMs: measureEnd(startMs),
        source: 'mock',
      };
    }

    const sql = 'INSERT INTO ticket_events (ticket_id, event_type, metadata, created_at) VALUES (?, ?, ?, NOW())';
    await queryFabricLakehouse(sql, [ticketId, eventType, JSON.stringify(metadata)]);
    return {
      eventId: `fabric-event-${Date.now()}`,
      ticketId,
      eventType,
      metadata,
      processingTimeMs: measureEnd(startMs),
      source: 'fabric',
    };
  } catch (error) {
    logError(MODULE, 'logTicketEvent failed — mock fallback', error);
    return {
      eventId: `mock-event-${Date.now()}`,
      ticketId,
      eventType,
      metadata,
      processingTimeMs: measureEnd(startMs),
      source: 'mock-fallback',
      error: error.message,
    };
  }
}

export async function getSimilarTickets(description, limit = 3) {
  const startMs = measureStart();
  try {
    log(MODULE, 'Finding similar historical tickets');

    const mockSimilar = {
      SharePoint: [
        { id: 'TKT-0847', subject: 'SharePoint permission denied for project site', resolution: 'Added user to site Members group', resolutionTimeHours: 2.1, similarity: 0.91 },
        { id: 'TKT-0793', subject: 'Cannot open SharePoint document library', resolution: 'Cleared SharePoint cache and re-synced OneDrive', resolutionTimeHours: 1.4, similarity: 0.85 }
      ],
      Exchange: [
        { id: 'TKT-0654', subject: 'Outlook calendar not syncing with mobile', resolution: 'Reset cached mode and rebuilt OST file', resolutionTimeHours: 1.8, similarity: 0.88 },
        { id: 'TKT-0601', subject: 'Shared mailbox not appearing in Outlook', resolution: 'Re-added account and waited 30 min for provisioning', resolutionTimeHours: 0.5, similarity: 0.82 }
      ],
      Teams: [
        { id: 'TKT-0732', subject: 'Teams audio dropping during calls', resolution: 'Updated Teams client and cleared cache', resolutionTimeHours: 1.2, similarity: 0.89 },
        { id: 'TKT-0698', subject: 'Teams presence showing offline incorrectly', resolution: 'Signed out and back in to Teams', resolutionTimeHours: 0.3, similarity: 0.84 }
      ],
      Identity: [
        { id: 'TKT-0521', subject: 'MFA not working after new phone setup', resolution: 'Re-registered authenticator app via aka.ms/mfasetup', resolutionTimeHours: 0.5, similarity: 0.93 },
        { id: 'TKT-0489', subject: 'Account locked out after failed login attempts', resolution: 'Unlocked via Azure AD and reset MFA', resolutionTimeHours: 0.3, similarity: 0.87 }
      ],
      Network: [
        { id: 'TKT-0412', subject: 'VPN connection dropping every hour', resolution: 'Updated VPN client and changed gateway', resolutionTimeHours: 2.5, similarity: 0.86 }
      ],
      General: [
        { id: 'TKT-0301', subject: 'General M365 access issue', resolution: 'Standard troubleshooting applied', resolutionTimeHours: 3.0, similarity: 0.70 }
      ]
    };

    if (!hasFabricCredentials()) {
      const desc = description.toLowerCase();
      const detectedCategory = Object.keys(mockSimilar).find(cat => {
        const keywords = {
          SharePoint: ['sharepoint', 'site', 'permission'],
          Exchange: ['outlook', 'email', 'calendar', 'mailbox'],
          Teams: ['teams', 'meeting', 'audio'],
          Identity: ['password', 'mfa', 'login', 'locked', 'authentication'],
          Network: ['vpn', 'network', 'connection']
        };
        return (keywords[cat] || []).some(kw => desc.includes(kw));
      }) || 'General';

      const results = mockSimilar[detectedCategory] || mockSimilar.General;
      return { similarTickets: results.slice(0, limit), processingTimeMs: measureEnd(startMs), source: 'mock' };
    }

    const sql = 'SELECT TOP ? id, subject, resolution, resolution_time_hours FROM resolved_tickets ORDER BY similarity DESC';
    const { data, processingTimeMs } = await queryFabricLakehouse(sql, [limit]);
    return { similarTickets: data.rows || Object.values(mockSimilar).flat().slice(0, limit), processingTimeMs, source: 'fabric' };
  } catch (error) {
    logError(MODULE, 'getSimilarTickets failed — mock fallback', error);
    return {
      similarTickets: [
        { id: 'TKT-0847', subject: 'Similar issue resolved previously', resolution: 'Standard fix applied', resolutionTimeHours: 2.0, similarity: 0.80 },
      ],
      processingTimeMs: measureEnd(startMs),
      source: 'mock-fallback',
      error: error.message,
    };
  }
}
