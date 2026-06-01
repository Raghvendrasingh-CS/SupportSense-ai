// Support pipeline orchestrator — runs Triage → Resolution → Escalation agents sequentially.
import { v4 as uuidv4 } from 'uuid';
import { log, logError, measureStart, measureEnd } from '../utils/logger.js';
import { triageTicket } from '../agents/TriageAgent.js';
import { resolveTicket } from '../agents/ResolutionAgent.js';
import { escalateTicket } from '../agents/EscalationAgent.js';
import { getCustomerHistory, addToMemory, getCustomerRiskProfile, getSentimentTrend, seedDemoMemory, getMemoryStats } from '../agents/ticketMemory.js';
import { buildReasoningChain } from '../agents/reasoningChain.js';
import { db } from '../db/store.js';

const MODULE = 'SupportPipeline';

export function getTicket(ticketId) {
  const tickets = db.getTickets();
  return tickets.find(t => t.id === ticketId) || null;
}

export function getAllTickets() {
  return db.getTickets();
}

export function saveTicket(ticket) {
  const tickets = db.getTickets();
  const idx = tickets.findIndex(t => t.id === ticket.id);
  if (idx !== -1) {
    tickets[idx] = ticket;
  } else {
    tickets.push(ticket);
  }
  db.saveTickets(tickets);
}

export function createTicket(data) {
  const tickets = db.getTickets();
  const ticket = {
    id: data.id || `TKT-${uuidv4().slice(0, 8).toUpperCase()}`,
    subject: data.subject,
    description: data.description || '',
    requesterId: data.requesterId || 'user-001',
    status: 'received',
    priority: data.priority || null,
    category: data.category || null,
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    pipeline: null,
  };
  tickets.push(ticket);
  db.saveTickets(tickets);
  return ticket;
}

export async function processTicket(ticketData, emitFn = null) {
  const pipelineStart = measureStart();
  try {
    const ticket = typeof ticketData === 'string'
      ? getTicket(ticketData)
      : ticketData.id
        ? ticketData
        : createTicket(ticketData);

    if (!ticket) {
      throw new Error(`Ticket not found: ${ticketData}`);
    }

    log(MODULE, `Pipeline started for ${ticket.id}`, { subject: ticket.subject });

    if (emitFn) {
      emitFn('pipeline:started', {
        ticketId: ticket.id,
        subject: ticket.subject,
        timestamp: new Date().toISOString(),
      });
    }

    ticket.status = 'triaging';
    ticket.updatedAt = new Date().toISOString();
    saveTicket(ticket);

    const customerEmail = ticket.requesterId.includes('@') ? ticket.requesterId : ticket.requesterId + '@company.com';
    const customerHistory = getCustomerHistory(customerEmail);
    const riskProfile = getCustomerRiskProfile(customerEmail);
    const sentimentTrend = getSentimentTrend(customerEmail);
    log(MODULE, `Customer memory loaded for ${customerEmail}: ${customerHistory.length} previous tickets, risk: ${riskProfile.riskLevel}`);
    if (sentimentTrend.shouldBoostUrgency) {
      log(MODULE, `Sentiment trend escalating for ${customerEmail} — urgency will be boosted`);
    }
    ticket.customerHistory = customerHistory;
    ticket.riskProfile = riskProfile;
    ticket.sentimentTrend = sentimentTrend;

    const triageStart = measureStart();
    const triageResult = await triageTicket(ticket, emitFn);
    log(MODULE, 'TriageAgent finished', { processingTimeMs: measureEnd(triageStart) });

    ticket.status = 'resolving';
    ticket.priority = triageResult.classification.priority;
    ticket.category = triageResult.classification.category;
    ticket.updatedAt = new Date().toISOString();
    saveTicket(ticket);

    const resolutionStart = measureStart();
    const resolutionResult = await resolveTicket(ticket, triageResult, emitFn);
    log(MODULE, 'ResolutionAgent finished', { processingTimeMs: measureEnd(resolutionStart) });

    ticket.status = resolutionResult.status === 'auto_resolved' ? 'resolved' : 'escalating';
    ticket.updatedAt = new Date().toISOString();
    saveTicket(ticket);

    const escalationStart = measureStart();
    const escalationResult = await escalateTicket(ticket, triageResult, resolutionResult, emitFn);
    log(MODULE, 'EscalationAgent finished', { processingTimeMs: measureEnd(escalationStart) });

    if (escalationResult.escalated) {
      ticket.status = 'escalated';
      ticket.assignedAgent = escalationResult.assignedAgent;
    } else if (resolutionResult.status === 'auto_resolved') {
      ticket.status = 'resolved';
    } else {
      ticket.status = 'pending_review';
    }

    const reasoning = buildReasoningChain(ticket, triageResult, resolutionResult, escalationResult, customerHistory, sentimentTrend); log(MODULE, `Reasoning chain built: ${reasoning.totalSteps} steps, key decision: ${reasoning.keyDecisionPoint}`);

    const finalStatus = ticket.status === 'resolved' ? 'resolved' : ticket.status === 'escalated' ? 'escalated' : 'pending_review';
    addToMemory(
      customerEmail,
      ticket.id,
      ticket.subject,
      triageResult.classification.category,
      triageResult.classification.priority,
      triageResult.classification.sentiment || 'neutral',
      finalStatus,
      resolutionResult.resolution?.summary?.slice(0, 100) || ticket.subject
    );

    const totalProcessingTimeMs = measureEnd(pipelineStart);

    ticket.pipeline = {
      triage: triageResult,
      resolution: resolutionResult,
      escalation: escalationResult,
      reasoning: reasoning,
      totalProcessingTimeMs,
      completedAt: new Date().toISOString(),
    };
    ticket.updatedAt = new Date().toISOString();
    saveTicket(ticket);

    const pipelineResult = {
      ticketId: ticket.id,
      subject: ticket.subject,
      status: ticket.status,
      triage: triageResult,
      resolution: resolutionResult,
      escalation: escalationResult,
      reasoning: reasoning,
      customerHistory,
      riskProfile,
      sentimentTrend,
      memoryStats: getMemoryStats(),
      totalProcessingTimeMs,
      timestamp: new Date().toISOString(),
    };

    log(MODULE, `Pipeline complete for ${ticket.id}`, {
      status: ticket.status,
      totalProcessingTimeMs,
    });

    if (emitFn) {
      emitFn('pipeline:completed', pipelineResult);
    }

    // Cross-ticket incident pattern detection
    try {
      const allTickets = getAllTickets();
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      const recentSameCategory = allTickets.filter(t => 
        t.category === ticket.category && 
        new Date(t.createdAt) > tenMinutesAgo
      );

      if (recentSameCategory.length >= 3 && (ticket.category === 'Teams' || ticket.category === 'Exchange' || ticket.category === 'SharePoint')) {
        const hasHighOrCritical = recentSameCategory.some(t => t.priority === 'critical' || t.priority === 'high');
        if (hasHighOrCritical && emitFn) {
          emitFn('incident:detected', {
            category: ticket.category,
            ticketCount: recentSameCategory.length,
            timeWindowMinutes: 10,
            relatedTickets: recentSameCategory.map(t => ({ id: t.id, subject: t.subject, priority: t.priority })),
            recommendation: `Possible service-wide incident on ${ticket.category}. Correlate with Microsoft Graph service health.`
          });
        }
      }
    } catch (eErr) {
      logError(MODULE, 'Incident pattern detection failed', eErr);
    }

    return pipelineResult;
  } catch (error) {
    logError(MODULE, 'processTicket failed', error);
    const errorResult = {
      ticketId: typeof ticketData === 'object' ? ticketData.id : ticketData,
      status: 'error',
      error: error.message,
      totalProcessingTimeMs: measureEnd(pipelineStart),
      timestamp: new Date().toISOString(),
    };
    if (emitFn) emitFn('pipeline:error', errorResult);
    return errorResult;
  }
}

export async function processBatch(ticketList, emitFn = null) {
  const startMs = measureStart();
  try {
    log(MODULE, `Processing batch of ${ticketList.length} tickets in parallel`);

    if (emitFn) {
      emitFn('batch:started', { count: ticketList.length, timestamp: new Date().toISOString() });
    }

    // Process tickets concurrently (limit/concurrency depends on inputs, here we run them in parallel)
    const promises = ticketList.map(t => processTicket(t, emitFn));
    const settlements = await Promise.allSettled(promises);
    const results = settlements.map((s, idx) => s.status === 'fulfilled' ? s.value : { status: 'error', error: s.reason, ticketId: ticketList[idx]?.id });

    const batchResult = {
      processed: results.length,
      resolved: results.filter((r) => r.status === 'resolved').length,
      escalated: results.filter((r) => r.status === 'escalated').length,
      errors: results.filter((r) => r.status === 'error').length,
      results,
      processingTimeMs: measureEnd(startMs),
      timestamp: new Date().toISOString(),
    };

    log(MODULE, 'Batch processing complete', batchResult);

    if (emitFn) emitFn('batch:completed', batchResult);

    return batchResult;
  } catch (error) {
    logError(MODULE, 'processBatch failed', error);
    return { processed: 0, errors: 1, error: error.message, processingTimeMs: measureEnd(startMs) };
  }
}

export function clearTickets() {
  db.saveTickets([]);
  log(MODULE, 'Ticket store cleared');
}

export function getDemoTickets() {
  const demos = [
    { subject: 'ENTIRE SYSTEM DOWN — 200 stores affected — EMERGENCY', description: 'Our entire point of sale system has been down across all 200 stores since 9 AM this morning. We are losing thousands of dollars every single minute. I have escalated internally and need someone to call me immediately. This is completely unacceptable.', requesterId: 'david.park@retailchain.com' },
    { subject: 'Threatening legal action — 4th time reporting data export bug', description: 'This is the FOURTH time I am reporting the exact same data export issue. Customer ID: C-44821. I have been a paying customer for 3 years and this is completely unacceptable. I am now consulting my legal team regarding breach of service agreement.', requesterId: 'sunita@logistics.co.in' },
    { subject: 'How to reset two-factor authentication on new phone', description: 'I got a new phone last week and need to reset my two-factor authentication. My old authenticator app is no longer working and I cannot log in to my account at all.', requesterId: 'michelle.chen@designstudio.com' }
  ];
  // Map and create
  return demos.map((d) => createTicket(d));
}

export function seedDemoTickets() {
  clearTickets();
  seedDemoMemory();
  
  const allDemos = [
    { subject: 'Cannot access SharePoint project site — Access Denied', description: 'Getting access denied when trying to open the Contoso Project Alpha SharePoint site. Was working yesterday. Other team members can access it fine. I need this for today\'s client presentation.', requesterId: 'priya.sharma@techcorp.com' },
    { subject: 'ENTIRE SYSTEM DOWN — 200 stores affected — EMERGENCY', description: 'Our entire point of sale system has been down across all 200 stores since 9 AM this morning. We are losing thousands of dollars every single minute. I have escalated internally and need someone to call me immediately. This is completely unacceptable.', requesterId: 'david.park@retailchain.com' },
    { subject: 'Outlook calendar not syncing with mobile device', description: 'Calendar events created on desktop Outlook are not appearing on my iPhone Outlook app. Email sync works fine. I have tried restarting both devices. This has been happening for 3 days.', requesterId: 'arjun.mehta@globalinc.com' },
    { subject: 'Threatening legal action — 4th time reporting data export bug', description: 'This is the FOURTH time I am reporting the exact same data export issue. Customer ID: C-44821. I have been a paying customer for 3 years and this is completely unacceptable. I am now consulting my legal team regarding breach of service agreement.', requesterId: 'sunita@logistics.co.in' },
    { subject: 'Teams meeting audio cutting out during client calls', description: 'During Teams video calls my audio drops every few minutes. Video works fine. This is blocking my client meetings and costing us business. Started after the last Windows update.', requesterId: 'sarah.johnson@enterprise.co' },
    { subject: 'Possible unauthorized access to admin panel detected', description: 'Our security team detected unauthorized login attempts from unknown IP addresses to our admin panel. Error code 0x4F21. This may be a breach. Need immediate response from your security team.', requesterId: 'james.wilson@bank.com' },
    { subject: 'How to reset two-factor authentication on new phone', description: 'I got a new phone last week and need to reset my two-factor authentication. My old authenticator app is no longer working and I cannot log in to my account at all.', requesterId: 'michelle.chen@designstudio.com' },
    { subject: 'SharePoint file upload failing for large files over 100MB', description: 'When trying to upload video files larger than 100MB to our SharePoint document library the upload fails at around 80 percent. Smaller files work fine. We need to share project videos with the client.', requesterId: 'vikram.nair@startupxyz.in' },
    { subject: 'Teams channel permissions not updating after role change', description: 'I was promoted to team lead last week but my Teams channel permissions have not been updated. I cannot access the management channel or create new channels. HR confirmed the role change in the system.', requesterId: 'rohan.kapoor@manufacturing.com' },
    { subject: 'Exchange email delivery delayed by 4 to 6 hours', description: 'Emails sent from our Exchange server to external clients are being delayed by 4 to 6 hours. Internal emails work instantly. This is causing serious communication problems with our customers.', requesterId: 'ananya.bose@finance.org' },
    { subject: 'OneDrive sync stuck at 99 percent for 2 days', description: 'My OneDrive has been stuck syncing at 99 percent for the past 2 days. I have tried pausing and resuming, restarting the app, and signing out and back in. Nothing works. I have important files that are not backed up.', requesterId: 'kavya.iyer@media.com' },
    { subject: 'New employee cannot receive any emails — mailbox not provisioned', description: 'We hired a new developer who started yesterday. Their Microsoft 365 account was created but they are not receiving any emails. The mailbox does not appear to be provisioned correctly. This is blocking their onboarding.', requesterId: 'thomas.baker@healthcare.org' },
    { subject: 'SharePoint search returning no results for any query', description: 'The search function in our main SharePoint site has stopped returning results completely. Searching for document names, people, or any content returns zero results. This was working fine last week.', requesterId: 'lisa.park@agency.co' },
    { subject: 'Teams status showing offline even when actively working', description: 'My Teams presence status keeps showing as offline or away even when I am actively using my computer. Clients and colleagues think I am unavailable. I have checked the status settings and everything looks correct.', requesterId: 'nikhil.sharma@retail.com' },
    { subject: 'Cannot install Microsoft 365 apps — license error 0x80004005', description: 'Getting error 0x80004005 when trying to install Microsoft 365 apps on a new laptop. The license is assigned in the admin portal. I have tried the offline installer and the online installer. Same error both times.', requesterId: 'emma.thompson@corp.com' },
    { subject: 'Shared mailbox not appearing in Outlook after permissions granted', description: 'Admin granted me access to the sales shared mailbox 3 days ago but it is still not appearing in my Outlook. I have tried removing and re-adding my account. The permission shows correctly in the admin portal.', requesterId: 'aditya.kumar@freelance.in' },
    { subject: 'Teams recording not saving to SharePoint after meeting ends', description: 'Meeting recordings are not being saved to SharePoint automatically after Teams meetings end. The recording starts fine but after the meeting the file is nowhere to be found. This has happened for the last 5 meetings.', requesterId: 'riya.patel@agency.com' },
    { subject: 'Azure AD conditional access blocking VPN users from email', description: 'Since the new conditional access policy was applied yesterday all users connecting via VPN are being blocked from accessing Outlook and Teams. Around 45 remote employees are affected. We need an urgent exception or rollback.', requesterId: 'carlos.mendez@logistics.net' },
    { subject: 'Power Automate flow failing with authentication error', description: 'Our critical invoice processing Power Automate flow has been failing since yesterday with an authentication error. It processes around 200 invoices per day and everything is now stuck. Finance team is blocked.', requesterId: 'yuki.tanaka@finance.jp' },
    { subject: 'Request for Microsoft 365 usage report for last quarter', description: 'Could you please provide a usage report for our Microsoft 365 tenant for Q1 2025? We need active user counts, Teams meeting minutes, SharePoint storage used, and Exchange mailbox sizes for our board presentation next week.', requesterId: 'sarah.okonkwo@ngo.org' },
  ];

  // Seed all 20 tickets into db
  allDemos.forEach((d) => createTicket(d));

  // Return the 3 curated tickets for the active process flow
  const selectCurated = [
    'ENTIRE SYSTEM DOWN — 200 stores affected — EMERGENCY',
    'Threatening legal action — 4th time reporting data export bug',
    'How to reset two-factor authentication on new phone'
  ];

  const dbTickets = db.getTickets();
  return dbTickets.filter((t) => selectCurated.includes(t.subject));
}

export { getMemoryStats, getCustomerHistory, getCustomerRiskProfile } from '../agents/ticketMemory.js';
