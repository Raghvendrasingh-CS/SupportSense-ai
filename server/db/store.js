import pg from 'pg';

const { Pool } = pg;
const MODULE = 'DBStore';

// Initialize PostgreSQL connection pool
let pool = null;
let useMemoryCache = false;

const memoryCache = {
  tickets: [],
  memory: {}
};

// Initialize pool if DATABASE_URL is set
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  console.log(`[${MODULE}] PostgreSQL (Supabase) pool initialized.`);
} else {
  console.warn(`[${MODULE}] No DATABASE_URL found — using in-memory cache.`);
  useMemoryCache = true;
}

// Auto-create tables on startup
async function initializeTables() {
  if (!pool) return;
  try {
    // Note: Use individual queries for better reliability in some PG drivers
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS memory (
        email TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        ticket_id TEXT,
        data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS knowledge_base (
        id TEXT PRIMARY KEY,
        title TEXT,
        category TEXT,
        content TEXT,
        relevance_score REAL
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS resolved_tickets (
        id TEXT PRIMARY KEY,
        subject TEXT,
        resolution TEXT,
        resolution_time_hours REAL,
        similarity REAL,
        category TEXT
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ticket_volume_daily (
        date TEXT PRIMARY KEY,
        ticket_count INTEGER
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS category_breakdown (
        category TEXT PRIMARY KEY,
        count INTEGER,
        avg_resolution_hours REAL
      );
    `);

    console.log(`[${MODULE}] Tables initialized successfully.`);
    await seedTables();
  } catch (err) {
    console.error(`[${MODULE}] Table initialization failed:`, err.message);
    // Don't kill the process, just fallback to memory so the UI still loads
    useMemoryCache = true;
  }
}

async function seedTables() {
  try {
    const kbCheck = await pool.query('SELECT COUNT(*) as count FROM knowledge_base');
    if (parseInt(kbCheck.rows[0].count) === 0) {
      console.log(`[${MODULE}] Seeding knowledge_base table...`);
      await pool.query(`
        INSERT INTO knowledge_base (id, title, category, content, relevance_score) VALUES
        ('kb-001', 'SharePoint Access Denied — Resolution Steps', 'SharePoint', 'Verify site permissions, check group membership, clear browser cache, re-authenticate via portal.office.com', 0.94),
        ('kb-002', 'Outlook Calendar Sync Troubleshooting', 'Exchange', 'Reset sync folders, verify autodiscover, check cached mode settings, rebuild OST file', 0.89),
        ('kb-003', 'Teams Audio/Video Quality Issues', 'Teams', 'Check network bandwidth, update Teams client, verify device permissions, test with Teams admin diagnostics', 0.87),
        ('kb-004', 'Password Reset Self-Service Guide', 'Identity', 'Use aka.ms/sspr, verify MFA methods, contact helpdesk if locked out after 5 attempts', 0.82),
        ('kb-005', 'VPN Connection Failures', 'Network', 'Verify credentials, check VPN client version, ensure split tunneling config, test alternate gateway', 0.78)
        ON CONFLICT (id) DO NOTHING;
      `);
    }

    const resolvedCheck = await pool.query('SELECT COUNT(*) as count FROM resolved_tickets');
    if (parseInt(resolvedCheck.rows[0].count) === 0) {
      console.log(`[${MODULE}] Seeding resolved_tickets table...`);
      await pool.query(`
        INSERT INTO resolved_tickets (id, subject, resolution, resolution_time_hours, similarity, category) VALUES
        ('TKT-0847', 'SharePoint permission denied for project site', 'Added user to site Members group', 2.1, 0.91, 'SharePoint'),
        ('TKT-0793', 'Cannot open SharePoint document library', 'Cleared SharePoint cache and re-synced OneDrive', 1.4, 0.85, 'SharePoint'),
        ('TKT-0654', 'Outlook calendar not syncing with mobile', 'Reset cached mode and rebuilt OST file', 1.8, 0.88, 'Exchange'),
        ('TKT-0601', 'Shared mailbox not appearing in Outlook', 'Re-added account and waited 30 min for provisioning', 0.5, 0.82, 'Exchange'),
        ('TKT-0732', 'Teams audio dropping during calls', 'Updated Teams client and cleared cache', 1.2, 0.89, 'Teams'),
        ('TKT-0698', 'Teams presence showing offline incorrectly', 'Signed out and back in to Teams', 0.3, 0.84, 'Teams'),
        ('TKT-0521', 'MFA not working after new phone setup', 'Re-registered authenticator app via aka.ms/mfasetup', 0.5, 0.93, 'Identity'),
        ('TKT-0489', 'Account locked out after failed login attempts', 'Unlocked via Azure AD and reset MFA', 0.3, 0.87, 'Identity'),
        ('TKT-0412', 'VPN connection dropping every hour', 'Updated VPN client and changed gateway', 2.5, 0.86, 'Network'),
        ('TKT-0301', 'General M365 access issue', 'Standard troubleshooting applied', 3.0, 0.70, 'General')
        ON CONFLICT (id) DO NOTHING;
      `);
    }

    const volumeCheck = await pool.query('SELECT COUNT(*) as count FROM ticket_volume_daily');
    if (parseInt(volumeCheck.rows[0].count) === 0) {
      console.log(`[${MODULE}] Seeding ticket_volume_daily table...`);
      await pool.query(`
        INSERT INTO ticket_volume_daily (date, ticket_count) VALUES
        ('2026-05-26', 42), ('2026-05-27', 38), ('2026-05-28', 55),
        ('2026-05-29', 47), ('2026-05-30', 61), ('2026-05-31', 53),
        ('2026-06-01', 49), ('2026-06-02', 35)
        ON CONFLICT (date) DO NOTHING;
      `);
    }

    const breakdownCheck = await pool.query('SELECT COUNT(*) as count FROM category_breakdown');
    if (parseInt(breakdownCheck.rows[0].count) === 0) {
      console.log(`[${MODULE}] Seeding category_breakdown table...`);
      await pool.query(`
        INSERT INTO category_breakdown (category, count, avg_resolution_hours) VALUES
        ('SharePoint', 89, 4.2), ('Exchange', 67, 3.1), ('Teams', 54, 2.8),
        ('Identity', 41, 1.5), ('Network', 33, 6.7)
        ON CONFLICT (category) DO NOTHING;
      `);
    }

    console.log(`[${MODULE}] Seeding complete.`);
  } catch (err) {
    console.error(`[${MODULE}] Seeding failed:`, err.message);
  }
}

// SAFE INITIALIZATION: Wrap in an IIFE to avoid top-level await issues
(async () => {
  try {
    await initializeTables();
  } catch (err) {
    console.error(`[${MODULE}] Critical boot error:`, err);
  }
})();

export const db = {
  getTickets: async () => {
    if (useMemoryCache) return memoryCache.tickets;
    try {
      const result = await pool.query('SELECT data FROM tickets ORDER BY created_at DESC');
      return result.rows.map(r => r.data);
    } catch (err) {
      console.error(`[${MODULE}] getTickets failed:`, err.message);
      return [];
    }
  },

  saveTicket: async (ticket) => {
    if (useMemoryCache) {
      const idx = memoryCache.tickets.findIndex(t => t.id === ticket.id);
      if (idx >= 0) memoryCache.tickets[idx] = ticket;
      else memoryCache.tickets.unshift(ticket);
      return;
    }
    try {
      await pool.query(
        `INSERT INTO tickets (id, data, created_at, updated_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = $4`,
        [ticket.id, ticket, ticket.createdAt || new Date().toISOString(), new Date().toISOString()]
      );
    } catch (err) {
      console.error(`[${MODULE}] saveTicket failed:`, err.message);
    }
  },

  saveTickets: async (tickets) => {
    if (useMemoryCache) {
      memoryCache.tickets = tickets;
      return;
    }
    try {
      for (const ticket of tickets) {
        await db.saveTicket(ticket);
      }
    } catch (err) {
      console.error(`[${MODULE}] saveTickets failed:`, err.message);
    }
  },

  getMemory: async () => {
    if (useMemoryCache) return memoryCache.memory;
    try {
      const result = await pool.query('SELECT email, data FROM memory');
      const mem = {};
      for (const row of result.rows) {
        mem[row.email] = row.data;
      }
      return mem;
    } catch (err) {
      console.error(`[${MODULE}] getMemory failed:`, err.message);
      return {};
    }
  },

  saveMemory: async (memory) => {
    if (useMemoryCache) {
      memoryCache.memory = memory;
      return;
    }
    try {
      for (const [email, data] of Object.entries(memory)) {
        await pool.query(
          `INSERT INTO memory (email, data, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (email) DO UPDATE SET data = $2, updated_at = NOW()`,
          [email.toLowerCase(), data]
        );
      }
    } catch (err) {
      console.error(`[${MODULE}] saveMemory failed:`, err.message);
    }
  },

  query: async (sql, params = []) => {
    if (!pool) return { rows: [] };
    try {
      return await pool.query(sql, params);
    } catch (err) {
      console.error(`[${MODULE}] query failed:`, err.message);
      return { rows: [] };
    }
  }
};
