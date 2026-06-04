import pg from 'pg';
const { Pool } = pg;

const MODULE = 'DBStore';
let pool = null;
let useMemoryCache = false;

// In-memory cache for sync pipeline operations
let ticketCache = [];
let memoryCache = {};

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  console.log(`[${MODULE}] PostgreSQL (Supabase) connected.`);
} else {
  console.warn(`[${MODULE}] No DATABASE_URL — using memory cache.`);
  useMemoryCache = true;
}

async function initializeTables() {
  if (!pool) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS memory (
        email TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS ticket_volume_daily (
        date TEXT PRIMARY KEY,
        ticket_count INTEGER
      );
      CREATE TABLE IF NOT EXISTS category_breakdown (
        category TEXT PRIMARY KEY,
        count INTEGER,
        avg_resolution_hours REAL
      );
      CREATE TABLE IF NOT EXISTS knowledge_base (
        id TEXT PRIMARY KEY,
        title TEXT,
        category TEXT,
        content TEXT,
        relevance_score REAL
      );
      CREATE TABLE IF NOT EXISTS resolved_tickets (
        id TEXT PRIMARY KEY,
        subject TEXT,
        resolution TEXT,
        resolution_time_hours REAL,
        similarity REAL,
        category TEXT
      );
    `);
    console.log(`[${MODULE}] Tables initialized.`);
    await seedTables();
    // Load tickets into memory cache
    const res = await pool.query('SELECT data FROM tickets ORDER BY created_at DESC');
    ticketCache = res.rows.map(r => r.data);
    const memRes = await pool.query('SELECT email, data FROM memory');
    memoryCache = {};
    for (const row of memRes.rows) memoryCache[row.email] = row.data;
    console.log(`[${MODULE}] Cache loaded: ${ticketCache.length} tickets.`);
  } catch (err) {
    console.error(`[${MODULE}] Table init failed:`, err.message);
    useMemoryCache = true;
  }
}

async function seedTables() {
  try {
    const volCheck = await pool.query('SELECT COUNT(*) as count FROM ticket_volume_daily');
    if (parseInt(volCheck.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO ticket_volume_daily (date, ticket_count) VALUES
        ('Mon', 20), ('Tue', 35), ('Wed', 25), ('Thu', 45),
        ('Fri', 30), ('Sat', 15), ('Sun', 10)
        ON CONFLICT (date) DO NOTHING;
      `);
    }
    const catCheck = await pool.query('SELECT COUNT(*) as count FROM category_breakdown');
    if (parseInt(catCheck.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO category_breakdown (category, count, avg_resolution_hours) VALUES
        ('SharePoint', 89, 4.2), ('Exchange', 67, 3.1),
        ('Teams', 54, 2.8), ('Identity', 41, 1.5), ('Network', 33, 6.7)
        ON CONFLICT (category) DO NOTHING;
      `);
    }
    const kbCheck = await pool.query('SELECT COUNT(*) as count FROM knowledge_base');
    if (parseInt(kbCheck.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO knowledge_base (id, title, category, content, relevance_score) VALUES
        ('kb-001', 'SharePoint Access Denied', 'SharePoint', 'Verify site permissions, check group membership, clear browser cache', 0.94),
        ('kb-002', 'Outlook Calendar Sync', 'Exchange', 'Reset sync folders, verify autodiscover, rebuild OST file', 0.89),
        ('kb-003', 'Teams Audio Issues', 'Teams', 'Check network bandwidth, update Teams client, verify device permissions', 0.87),
        ('kb-004', 'Password Reset Guide', 'Identity', 'Use aka.ms/sspr, verify MFA methods, contact helpdesk if locked', 0.82),
        ('kb-005', 'VPN Connection Failures', 'Network', 'Verify credentials, check VPN client version, test alternate gateway', 0.78)
        ON CONFLICT (id) DO NOTHING;
      `);
    }
    const resolvedCheck = await pool.query('SELECT COUNT(*) as count FROM resolved_tickets');
    if (parseInt(resolvedCheck.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO resolved_tickets (id, subject, resolution, resolution_time_hours, similarity, category) VALUES
        ('TKT-0847', 'SharePoint permission denied', 'Added user to site Members group', 2.1, 0.91, 'SharePoint'),
        ('TKT-0654', 'Outlook calendar not syncing', 'Reset cached mode and rebuilt OST file', 1.8, 0.88, 'Exchange'),
        ('TKT-0732', 'Teams audio dropping', 'Updated Teams client and cleared cache', 1.2, 0.89, 'Teams'),
        ('TKT-0521', 'MFA not working after new phone', 'Re-registered authenticator app', 0.5, 0.93, 'Identity'),
        ('TKT-0412', 'VPN connection dropping', 'Updated VPN client and changed gateway', 2.5, 0.86, 'Network')
        ON CONFLICT (id) DO NOTHING;
      `);
    }
    console.log(`[${MODULE}] Seeding complete.`);
  } catch (err) {
    console.error(`[${MODULE}] Seeding failed:`, err.message);
  }
}

await initializeTables();

// Async write to Supabase in background
async function persistTicket(ticket) {
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO tickets (id, data, created_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (id) DO UPDATE SET data = $2`,
      [ticket.id, ticket]
    );
  } catch (e) {
    console.error(`[${MODULE}] persistTicket failed:`, e.message);
  }
}

async function persistMemory(email, data) {
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO memory (email, data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (email) DO UPDATE SET data = $2, updated_at = NOW()`,
      [email.toLowerCase(), data]
    );
  } catch (e) {
    console.error(`[${MODULE}] persistMemory failed:`, e.message);
  }
}

export const db = {
  // SYNC methods — used by pipeline
  getTickets: () => ticketCache,

  saveTickets: (tickets) => {
    ticketCache = tickets;
    // Persist each ticket to Supabase async
    tickets.forEach(t => persistTicket(t).catch(console.error));
  },

  saveTicket: (ticket) => {
    const idx = ticketCache.findIndex(t => t.id === ticket.id);
    if (idx >= 0) ticketCache[idx] = ticket;
    else ticketCache.unshift(ticket);
    persistTicket(ticket).catch(console.error);
  },

  getMemory: () => memoryCache,

  saveMemory: (memory) => {
    memoryCache = memory;
    Object.entries(memory).forEach(([email, data]) =>
      persistMemory(email, data).catch(console.error)
    );
  },

  // ASYNC methods — used by API routes
  getTicketsAsync: async () => {
    if (!pool) return ticketCache;
    try {
      const res = await pool.query('SELECT data FROM tickets ORDER BY created_at DESC');
      ticketCache = res.rows.map(r => r.data);
      return ticketCache;
    } catch (e) {
      console.error(`[${MODULE}] getTicketsAsync failed:`, e.message);
      return ticketCache;
    }
  },

  clearTickets: async () => {
    ticketCache = [];
    if (pool) {
      try {
        await pool.query('DELETE FROM tickets');
      } catch (e) {
        console.error(`[${MODULE}] clearTickets failed:`, e.message);
      }
    }
  },

  getAnalytics: async () => {
    if (!pool) {
      return {
        dailyVolume: [
          { name: 'Mon', value: 20 }, { name: 'Tue', value: 35 },
          { name: 'Wed', value: 25 }, { name: 'Thu', value: 45 },
          { name: 'Fri', value: 30 }, { name: 'Sat', value: 15 },
          { name: 'Sun', value: 10 }
        ],
        categoryDistribution: [
          { name: 'SharePoint', value: 89 }, { name: 'Exchange', value: 67 },
          { name: 'Teams', value: 54 }, { name: 'Identity', value: 41 },
          { name: 'Network', value: 33 }
        ]
      };
    }
    try {
      const vol = await pool.query(
        'SELECT date as name, ticket_count as value FROM ticket_volume_daily ORDER BY date ASC'
      );
      const cat = await pool.query(
        'SELECT category as name, count as value FROM category_breakdown'
      );
      return { dailyVolume: vol.rows, categoryDistribution: cat.rows };
    } catch (e) {
      console.error(`[${MODULE}] getAnalytics failed:`, e.message);
      return { dailyVolume: [], categoryDistribution: [] };
    }
  },

  query: async (sql, params = []) => {
    if (!pool) return { rows: [] };
    try {
      return await pool.query(sql, params);
    } catch (e) {
      console.error(`[${MODULE}] query failed:`, e.message);
      return { rows: [] };
    }
  }
};
