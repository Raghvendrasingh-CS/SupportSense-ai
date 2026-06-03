import pg from 'pg';

const { Pool } = pg;
const MODULE = 'DBStore';

let pool = null;
let useMemoryCache = false;

const memoryCache = {
  tickets: [],
  memory: {}
};

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

async function initializeTables() {
  if (!pool) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS memory (
        email TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS knowledge_base (
        id TEXT PRIMARY KEY,
        title TEXT,
        category TEXT,
        content TEXT,
        relevance_score REAL
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
    `);
    console.log(`[${MODULE}] Tables initialized successfully.`);
    await seedTables();
  } catch (err) {
    console.error(`[${MODULE}] Table initialization failed:`, err.message);
    useMemoryCache = true;
  }
}

async function seedTables() {
  try {
    const kbCheck = await pool.query('SELECT COUNT(*) as count FROM knowledge_base');
    if (parseInt(kbCheck.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO knowledge_base (id, title, category, content, relevance_score) VALUES
        ('kb-001', 'SharePoint Access Denied', 'SharePoint', 'Verify permissions and clear cache.', 0.94),
        ('kb-002', 'Outlook Sync Issues', 'Exchange', 'Reset sync folders and rebuild OST.', 0.89)
        ON CONFLICT (id) DO NOTHING;
      `);
    }

    const volumeCheck = await pool.query('SELECT COUNT(*) as count FROM ticket_volume_daily');
    if (parseInt(volumeCheck.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO ticket_volume_daily (date, ticket_count) VALUES
        ('2026-06-01', 45), ('2026-06-02', 38), ('2026-06-03', 52)
        ON CONFLICT (date) DO NOTHING;
      `);
    }

    const breakdownCheck = await pool.query('SELECT COUNT(*) as count FROM category_breakdown');
    if (parseInt(breakdownCheck.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO category_breakdown (category, count, avg_resolution_hours) VALUES
        ('SharePoint', 89, 4.2), ('Exchange', 67, 3.1), ('Teams', 54, 2.8)
        ON CONFLICT (category) DO NOTHING;
      `);
    }
    console.log(`[${MODULE}] Seeding complete.`);
  } catch (err) {
    console.error(`[${MODULE}] Seeding failed:`, err.message);
  }
}

(async () => { await initializeTables(); })();

export const db = {
  getTickets: async () => {
    if (useMemoryCache) return memoryCache.tickets;
    try {
      const result = await pool.query('SELECT data FROM tickets ORDER BY created_at DESC');
      return result.rows.map(r => r.data);
    } catch (err) { return []; }
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
        `INSERT INTO tickets (id, data, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = NOW()`,
        [ticket.id, ticket]
      );
    } catch (err) { console.error('Save failed', err.message); }
  },

  getAnalytics: async () => {
    if (useMemoryCache) return { dailyStats: [], categoryBreakdown: [] };
    try {
      const volume = await pool.query('SELECT date, ticket_count as count FROM ticket_volume_daily ORDER BY date ASC');
      const breakdown = await pool.query('SELECT category, count, avg_resolution_hours as "avgResolution" FROM category_breakdown');
      return { dailyStats: volume.rows, categoryBreakdown: breakdown.rows };
    } catch (err) { return { dailyStats: [], categoryBreakdown: [] }; }
  },

  query: async (sql, params = []) => {
    if (!pool) return { rows: [] };
    return await pool.query(sql, params);
  }
};
