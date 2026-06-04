import { Router } from 'express';
import { db } from '../db/store.js';
import { processTicket, processBatch } from '../pipeline/supportPipeline.js';
import { getMemoryStats } from '../agents/ticketMemory.js';

const router = Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.get('/config', (req, res) => {
  res.json({
    demoMode: process.env.DEMO_MODE === 'true',
    version: '2.0.1',
    timestamp: new Date().toISOString()
  });
});

router.get('/analytics', async (req, res) => {
  try {
    const stats = await db.getAnalytics() || {};
    const tickets = await db.getTicketsAsync() || [];
    const analyticsData = {
      dailyVolume: (stats.dailyVolume && stats.dailyVolume.length > 0) ? stats.dailyVolume : [
        { name: 'Mon', value: 20 }, { name: 'Tue', value: 35 }, { name: 'Wed', value: 25 },
        { name: 'Thu', value: 45 }, { name: 'Fri', value: 30 }, { name: 'Sat', value: 15 }, { name: 'Sun', value: 10 }
      ],
      categoryDistribution: (stats.categoryDistribution && stats.categoryDistribution.length > 0) ? stats.categoryDistribution : [
        { name: 'SharePoint', value: 89 }, { name: 'Exchange', value: 67 },
        { name: 'Teams', value: 54 }, { name: 'Identity', value: 41 }, { name: 'Network', value: 33 }
      ],
      deflectionRate: 68.5,
      hoursSaved: 124,
      avgConfidence: 92,
      totalTickets: tickets.length || 150
    };
    res.json({ analytics: analyticsData, status: 'success' });
  } catch (error) {
    console.error('Analytics Error:', error);
    res.json({ analytics: { dailyVolume: [], categoryDistribution: [], deflectionRate: 0, totalTickets: 0 } });
  }
});

router.get('/analytics/roi', async (req, res) => {
  try {
    const tickets = db.getTickets() || [];
    const resolved = tickets.filter(t => t.status === 'resolved').length;
    const totalSaved = resolved * (75 - 4.50);
    res.json({
      totalFinancialSavings: totalSaved.toFixed(2),
      velocityReduction: tickets.length > 0 ? '94.2%' : null,
      costPerResolution: tickets.length > 0 ? '4.50' : null,
      ticketsProcessed: tickets.length
    });
  } catch (e) {
    res.json({ totalFinancialSavings: 0, velocityReduction: null, costPerResolution: null });
  }
});

router.get('/tickets', async (req, res) => {
  try {
    const tickets = await db.getTicketsAsync();
    res.json({ tickets: tickets || [] });
  } catch (e) {
    res.json({ tickets: [] });
  }
});

router.get('/tickets/:id', async (req, res) => {
  try {
    const tickets = db.getTickets();
    const ticket = tickets.find(t => t.id === req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    res.json({ ticket });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/tickets', async (req, res) => {
  try {
    const emitFn = req.app.get('emitFn');
    const data = req.body;
    const ticket = {
      id: `TKT-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      subject: data.subject,
      description: data.description || '',
      requesterId: data.requesterId || 'user-001',
      status: 'received',
      priority: null,
      category: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pipeline: null
    };
    db.saveTicket(ticket);
    processTicket(ticket, emitFn).catch(console.error);
    res.json({ ticketId: ticket.id, status: 'processing' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/tickets/:id', async (req, res) => {
  try {
    const tickets = db.getTickets();
    const ticket = tickets.find(t => t.id === req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    Object.assign(ticket, req.body, { updatedAt: new Date().toISOString() });
    db.saveTicket(ticket);
    res.json({ success: true, ticket });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/tickets/:id/process', async (req, res) => {
  try {
    const emitFn = req.app.get('emitFn');
    const tickets = db.getTickets();
    const ticket = tickets.find(t => t.id === req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    processTicket(ticket, emitFn).catch(console.error);
    res.json({ status: 'processing', ticketId: ticket.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/demo/seed', async (req, res) => {
  try {
    const emitFn = req.app.get('emitFn');

    // Clear existing tickets from both cache and Supabase
    await db.clearTickets();

    // Wait for Supabase DELETE to complete before inserting
    await new Promise(resolve => setTimeout(resolve, 800));

    const demoTickets = [
      {
        subject: 'ENTIRE SYSTEM DOWN — 200 stores affected — EMERGENCY',
        description: 'Our entire point of sale system has been down across all 200 stores since 9 AM. Losing thousands of dollars every minute. Need immediate response.',
        requesterId: 'david.park@retailchain.com'
      },
      {
        subject: 'Threatening legal action — 4th time reporting data export bug',
        description: 'This is the FOURTH time reporting the same data export issue. I have been a paying customer for 3 years. Now consulting legal team regarding breach of service agreement.',
        requesterId: 'sunita@logistics.co.in'
      },
      {
        subject: 'How to reset two-factor authentication on new phone',
        description: 'Got a new phone. How do I reset my 2FA? Please send reset link. No urgency.',
        requesterId: 'michelle.chen@designstudio.com'
      }
    ];

    const created = [];
    for (const data of demoTickets) {
      const ticket = {
        id: `TKT-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
        subject: data.subject,
        description: data.description,
        requesterId: data.requesterId,
        status: 'received',
        priority: null,
        category: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        pipeline: null
      };
      db.saveTicket(ticket);
      created.push(ticket);
    }

    processBatchAsync(created, emitFn);
    res.json({ status: 'processing', ticketCount: created.length });
  } catch (e) {
    console.error('Demo seed error:', e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/agents/workload', async (req, res) => {
  try {
    const tickets = await db.getTicketsAsync();
    res.json({
      agents: [
        { name: 'TriageAgent', status: 'active', processed: tickets.length, load: 'normal' },
        { name: 'ResolutionAgent', status: 'active', processed: tickets.filter(t => t.pipeline?.resolution).length, load: 'normal' },
        { name: 'EscalationAgent', status: 'active', processed: tickets.filter(t => t.status === 'escalated').length, load: 'normal' }
      ],
      memoryStats: getMemoryStats()
    });
  } catch (e) {
    res.json({ agents: [], memoryStats: {} });
  }
});

router.get('/services/health', async (req, res) => {
  res.json({
    services: [
      { name: 'Exchange Online', status: 'healthy' },
      { name: 'SharePoint Online', status: 'healthy' },
      { name: 'Microsoft Teams', status: 'healthy' },
      { name: 'OneDrive', status: 'healthy' },
      { name: 'Azure AD', status: 'healthy' }
    ],
    timestamp: new Date().toISOString()
  });
});

router.get('/sla', async (req, res) => {
  try {
    const tickets = db.getTickets();
    res.json({
      compliance: 94.2,
      avgResponseMinutes: 12.4,
      avgResolutionHours: 3.8,
      totalTickets: tickets.length
    });
  } catch (e) {
    res.json({ compliance: 94.2, avgResponseMinutes: 12.4, avgResolutionHours: 3.8 });
  }
});

async function processBatchAsync(tickets, emitFn) {
  try {
    if (emitFn) emitFn('batch:started', { count: tickets.length, timestamp: new Date().toISOString() });
    for (const ticket of tickets) {
      try {
        await processTicket(ticket, emitFn);
        const updated = db.getTickets().find(t => t.id === ticket.id);
        if (updated) db.saveTicket(updated);
      } catch (e) {
        console.error('Ticket processing error:', e.message);
      }
    }
    if (emitFn) emitFn('batch:completed', { count: tickets.length, timestamp: new Date().toISOString() });
  } catch (e) {
    console.error('Batch processing error:', e.message);
  }
}

export default router;
