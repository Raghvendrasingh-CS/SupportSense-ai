// ticketMemory.js — Customer history and intelligence tracking system
// Remembers every customer interaction to personalize responses and detect risk

import { log, logError, measureStart, measureEnd } from '../utils/logger.js';

const MODULE = 'TicketMemory';
const memoryStore = new Map();

/**
 * Retrieves the history of a customer, returning up to the last 3 entries newest first.
 * @param {string} customerEmail 
 * @returns {Array} List of recent entries
 */
export function getCustomerHistory(customerEmail) {
  try {
    const email = customerEmail.toLowerCase();
    const entries = memoryStore.get(email) || [];
    const result = [...entries].reverse().slice(0, 3);
    log(MODULE, `History lookup for ${customerEmail}: ${result.length} previous tickets found`);
    return result;
  } catch (error) {
    logError(MODULE, `getCustomerHistory failed for ${customerEmail}`, error);
    return [];
  }
}

/**
 * Adds a ticket interaction to the customer's memory.
 * Keeps a maximum of 10 entries per customer, removing the oldest.
 */
export function addToMemory(customerEmail, ticketId, subject, category, priority, sentiment, resolution, summarySnippet) {
  try {
    const email = customerEmail.toLowerCase();
    let entries = memoryStore.get(email) || [];
    
    const newEntry = {
      ticketId,
      subject,
      category,
      priority,
      sentiment,
      resolution,
      summarySnippet,
      processedAt: new Date().toISOString()
    };
    
    entries.push(newEntry);
    if (entries.length > 10) {
      entries = entries.slice(-10);
    }
    
    memoryStore.set(email, entries);
    log(MODULE, `Memory updated for ${customerEmail} — total tickets: ${entries.length}`);
  } catch (error) {
    logError(MODULE, `addToMemory failed for ${customerEmail}`, error);
  }
}

/**
 * Evaluates the customer's history and calculates a risk profile and recommendation.
 * @param {string} customerEmail 
 * @returns {object} Customer risk profile details
 */
export function getCustomerRiskProfile(customerEmail) {
  try {
    const email = customerEmail.toLowerCase();
    const history = memoryStore.get(email) || [];
    
    const isRepeatCustomer = history.length > 0;
    const isRepeatComplainer = history.filter(h => h.sentiment === 'angry' || h.sentiment === 'frustrated').length >= 2;
    
    const mostRecent = history[history.length - 1];
    const hasUnresolvedIssue = mostRecent ? (mostRecent.resolution === 'escalated' || mostRecent.resolution === 'pending_review') : false;
    
    const totalTickets = history.length;
    
    let riskLevel = 'low';
    if (isRepeatComplainer || (hasUnresolvedIssue && totalTickets > 1)) {
      riskLevel = 'high';
    } else if (hasUnresolvedIssue) {
      riskLevel = 'medium';
    }
    
    let recommendation = '';
    if (riskLevel === 'high') {
      recommendation = 'Priority handling: customer has history of escalations.';
    } else if (riskLevel === 'medium') {
      recommendation = 'Previous unresolved issue detected — check history.';
    } else if (isRepeatCustomer) {
      recommendation = 'Returning customer — personalize response.';
    } else {
      recommendation = 'First contact — standard processing.';
    }
    
    return {
      isRepeatCustomer,
      isRepeatComplainer,
      hasUnresolvedIssue,
      totalTickets,
      riskLevel,
      recommendation
    };
  } catch (error) {
    logError(MODULE, `getCustomerRiskProfile failed for ${customerEmail}`, error);
    return {
      isRepeatCustomer: false,
      isRepeatComplainer: false,
      hasUnresolvedIssue: false,
      totalTickets: 0,
      riskLevel: 'low',
      recommendation: 'First contact — standard processing.'
    };
  }
}

/**
 * Tracks sentiment shifts over the last 3 history entries.
 * Returns whether urgency should be boosted due to negative escalation.
 * @param {string} customerEmail 
 * @returns {object} Sentiment trend details
 */
export function getSentimentTrend(customerEmail) {
  try {
    const email = customerEmail.toLowerCase();
    const history = memoryStore.get(email) || [];
    const last3 = history.slice(-3);
    
    const sentimentValues = {
      positive: 1,
      neutral: 2,
      frustrated: 3,
      angry: 4
    };
    
    const values = last3.map(h => sentimentValues[h.sentiment] || 2);
    
    if (values.length >= 2) {
      const v1 = values[values.length - 2];
      const v2 = values[values.length - 1];
      if (v1 >= 3 && v2 >= 3 && v2 > v1) {
        return {
          trend: 'escalating',
          shouldBoostUrgency: true,
          reason: 'Customer sentiment trending negative across recent interactions.'
        };
      }
    }
    
    return {
      trend: 'stable',
      shouldBoostUrgency: false,
      reason: 'No concerning sentiment trend detected.'
    };
  } catch (error) {
    logError(MODULE, `getSentimentTrend failed for ${customerEmail}`, error);
    return {
      trend: 'stable',
      shouldBoostUrgency: false,
      reason: 'No concerning sentiment trend detected.'
    };
  }
}

/**
 * Provides general stats on the tracking store.
 * @returns {object} Map overview statistics
 */
export function getMemoryStats() {
  try {
    let repeatCustomers = 0;
    let highRiskCustomers = 0;
    let totalInteractions = 0;
    
    for (const [email, history] of memoryStore.entries()) {
      totalInteractions += history.length;
      if (history.length > 1) {
        repeatCustomers++;
      }
      const riskProfile = getCustomerRiskProfile(email);
      if (riskProfile.riskLevel === 'high') {
        highRiskCustomers++;
      }
    }
    
    return {
      totalCustomers: memoryStore.size,
      repeatCustomers,
      highRiskCustomers,
      totalInteractions
    };
  } catch (error) {
    logError(MODULE, 'getMemoryStats failed', error);
    return {
      totalCustomers: 0,
      repeatCustomers: 0,
      highRiskCustomers: 0,
      totalInteractions: 0
    };
  }
}

/**
 * Seeds sample history for Sunita Reddy with three realistic chronological tickets.
 */
export function seedDemoMemory() {
  try {
    const email = 'sunita@logistics.co.in';
    
    // Entry 1 (oldest)
    addToMemory(
      email,
      'TKT-MEM-001',
      'Data export missing columns',
      'SharePoint',
      'medium',
      'neutral',
      'pending_review',
      'Data export returning incomplete columns for quarterly report.'
    );
    
    // Entry 2
    addToMemory(
      email,
      'TKT-MEM-002',
      'STILL having data export problem',
      'SharePoint',
      'high',
      'frustrated',
      'escalated',
      'Same data export issue persists — customer frustrated with lack of resolution.'
    );
    
    // Entry 3 (newest)
    addToMemory(
      email,
      'TKT-MEM-003',
      'Data export STILL broken after 3 months',
      'SharePoint',
      'high',
      'angry',
      'escalated',
      'Third report of identical issue — customer very angry escalated to L3.'
    );
    
    // Adjust processedAt dates back in time to look realistic
    const entries = memoryStore.get(email);
    if (entries && entries.length >= 3) {
      const now = new Date();
      
      const d90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const d45 = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);
      const d15 = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
      
      entries[entries.length - 3].processedAt = d90.toISOString();
      entries[entries.length - 2].processedAt = d45.toISOString();
      entries[entries.length - 1].processedAt = d15.toISOString();
      
      memoryStore.set(email, entries);
    }
    
    log(MODULE, `Demo memory seeded successfully for ${email}`);
  } catch (error) {
    logError(MODULE, 'seedDemoMemory failed', error);
  }
}
