// Microsoft Fabric IQ integration for ticket analytics and knowledge retrieval.
import { config, hasFabricCredentials } from '../config/env.js';
import { log, logError, measureStart, measureEnd } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import { db } from '../db/store.js';

const MODULE = 'FabricIQ';

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
  let score = article.relevanceScore || 0.5;
  const queryWords = q.split(' ');

  if (queryWords.some(w => title.includes(w))) {
    score = Math.min(0.99, score + 0.15);
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
      const rows = db.all('SELECT id, title, category, content, relevance_score as relevanceScore FROM knowledge_base');
      const results = rows
        .map((article) => ({ ...article, relevanceScore: scoreRelevance(query, article) }))
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, limit);

      log(MODULE, `Simulated SQLite KB search returned ${results.length} results`);
      return { results, processingTimeMs: measureEnd(startMs), source: 'simulated-sqlite' };
    }

    // Live Fabric execution path
    const sql = 'SELECT TOP ? id, title, category, content, relevance_score FROM knowledge_base WHERE CONTAINS(content, ?) ORDER BY relevance_score DESC';
    const { data, processingTimeMs } = await queryFabricLakehouse(sql, [limit, query]);
    return { results: data.rows || [], processingTimeMs, source: 'fabric' };
  } catch (error) {
    logError(MODULE, 'searchKnowledgeBase failed — simulated DB fallback', error);
    const rows = db.all('SELECT id, title, category, content, relevance_score as relevanceScore FROM knowledge_base') || [];
    const results = rows
      .map((article) => ({ ...article, relevanceScore: scoreRelevance(query, article) }))
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit);
    return { results, processingTimeMs: measureEnd(startMs), source: 'simulated-sqlite-fallback', error: error.message };
  }
}

export async function getTicketAnalytics() {
  const startMs = measureStart();
  try {
    log(MODULE, 'Fetching ticket analytics from Fabric');

    if (!hasFabricCredentials()) {
      log(MODULE, 'Returning simulated SQLite analytics');
      const dailyVolume = db.all('SELECT date, ticket_count as count FROM ticket_volume_daily ORDER BY date ASC');
      const breakdown = db.all('SELECT category, count, avg_resolution_hours as avgResolutionHours FROM category_breakdown');

      // Calculate dynamic SLA from local DB tickets
      const tickets = db.getTickets();
      const total = tickets.length;
      const resolved = tickets.filter(t => t.status === 'resolved').length;
      const compliance = total > 0 ? Math.min(100, Math.round((resolved / total) * 1000) / 10) : 94.2;

      const analytics = {
        ticketVolumeTrend: dailyVolume,
        categoryBreakdown: breakdown,
        slaCompliance: compliance,
        avgFirstResponseMinutes: 12.4,
        avgResolutionHours: 3.8,
      };

      return { analytics, processingTimeMs: measureEnd(startMs), source: 'simulated-sqlite' };
    }

    // Live Fabric query
    const sql = 'SELECT date, ticket_count FROM ticket_volume_daily ORDER BY date DESC LIMIT 7';
    const { data, processingTimeMs } = await queryFabricLakehouse(sql);
    
    const breakdown = db.all('SELECT category, count, avg_resolution_hours as avgResolutionHours FROM category_breakdown');
    
    return {
      analytics: {
        ticketVolumeTrend: data.rows || [],
        categoryBreakdown: breakdown,
        slaCompliance: 94.2,
        avgFirstResponseMinutes: 12.4,
        avgResolutionHours: 3.8,
      },
      processingTimeMs,
      source: 'fabric',
    };
  } catch (error) {
    logError(MODULE, 'getTicketAnalytics failed — simulated DB fallback', error);
    const dailyVolume = db.all('SELECT date, ticket_count as count FROM ticket_volume_daily ORDER BY date ASC') || [];
    const breakdown = db.all('SELECT category, count, avg_resolution_hours as avgResolutionHours FROM category_breakdown') || [];
    return {
      analytics: {
        ticketVolumeTrend: dailyVolume,
        categoryBreakdown: breakdown,
        slaCompliance: 94.2,
        avgFirstResponseMinutes: 12.4,
        avgResolutionHours: 3.8,
      },
      processingTimeMs: measureEnd(startMs),
      source: 'simulated-sqlite-fallback',
      error: error.message,
    };
  }
}

export async function logTicketEvent(ticketId, eventType, metadata = {}) {
  const startMs = measureStart();
  try {
    log(MODULE, `Logging ticket event: ${eventType} for ${ticketId}`, metadata);

    if (!hasFabricCredentials()) {
      return {
        eventId: `sim-event-${Date.now()}`,
        ticketId,
        eventType,
        metadata,
        processingTimeMs: measureEnd(startMs),
        source: 'simulated-sqlite',
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
    logError(MODULE, 'logTicketEvent failed — simulated DB fallback', error);
    return {
      eventId: `sim-event-${Date.now()}`,
      ticketId,
      eventType,
      metadata,
      processingTimeMs: measureEnd(startMs),
      source: 'simulated-sqlite-fallback',
      error: error.message,
    };
  }
}

export async function getSimilarTickets(description, limit = 3) {
  const startMs = measureStart();
  try {
    log(MODULE, 'Finding similar historical tickets');

    const desc = description.toLowerCase();
    const detectedCategory = ['SharePoint', 'Exchange', 'Teams', 'Identity', 'Network'].find(cat => {
      const keywords = {
        SharePoint: ['sharepoint', 'site', 'permission', 'access denied'],
        Exchange: ['outlook', 'email', 'calendar', 'mailbox', 'sync'],
        Teams: ['teams', 'meeting', 'audio', 'video'],
        Identity: ['password', 'mfa', 'login', 'locked', 'authentication'],
        Network: ['vpn', 'network', 'connection']
      };
      return (keywords[cat] || []).some(kw => desc.includes(kw));
    }) || 'General';

    if (!hasFabricCredentials()) {
      const rows = db.all('SELECT id, subject, resolution, resolution_time_hours as resolutionTimeHours, similarity, category FROM resolved_tickets');
      const results = rows.filter(r => r.category === detectedCategory || (detectedCategory === 'General' && r.category === 'General'));
      const finalResults = results.length > 0 ? results : rows;
      
      return { similarTickets: finalResults.slice(0, limit), processingTimeMs: measureEnd(startMs), source: 'simulated-sqlite' };
    }

    const sql = 'SELECT TOP ? id, subject, resolution, resolution_time_hours FROM resolved_tickets ORDER BY similarity DESC';
    const { data, processingTimeMs } = await queryFabricLakehouse(sql, [limit]);
    return { similarTickets: data.rows || [], processingTimeMs, source: 'fabric' };
  } catch (error) {
    logError(MODULE, 'getSimilarTickets failed — simulated DB fallback', error);
    const rows = db.all('SELECT id, subject, resolution, resolution_time_hours as resolutionTimeHours, similarity, category FROM resolved_tickets') || [];
    return {
      similarTickets: rows.slice(0, limit),
      processingTimeMs: measureEnd(startMs),
      source: 'simulated-sqlite-fallback',
      error: error.message,
    };
  }
}
