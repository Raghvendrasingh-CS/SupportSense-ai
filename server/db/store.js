import pg from 'pg';
const { Pool } = pg;
const MODULE = 'DBStore';

let pool = null;
let useMemoryCache = false;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  console.log(`[${MODULE}] PostgreSQL (Supabase) pool initialized.`);
} else {
  useMemoryCache = true;
}

// Auto-init and Seed
(async () => {
  if (!pool) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, data JSONB, created_at TIMESTAMP DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS ticket_volume_daily (date TEXT PRIMARY KEY, ticket_count INTEGER);
      CREATE TABLE IF NOT EXISTS category_breakdown (category TEXT PRIMARY KEY, count INTEGER, avg_resolution_hours REAL);
    `);
    
    // Seed Analytics if empty
    const count = await pool.query('SELECT COUNT(*) FROM ticket_volume_daily');
    if (parseInt(count.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO ticket_volume_daily (date, ticket_count) VALUES 
        ('2026-06-01', 12), ('2026-06-02', 18), ('2026-06-03', 25);
        INSERT INTO category_breakdown (category, count, avg_resolution_hours) VALUES 
        ('Technical', 45, 2.5), ('Billing', 20, 1.2), ('Access', 35, 0.8);
      `);
    }
    console.log(`[${MODULE}] DB Ready and Seeded.`);
  } catch (e) { console.error("DB Init Error", e.message); }
})();

export const db = {
  getTickets: async () => {
    if (useMemoryCache) return [];
    const res = await pool.query('SELECT data FROM tickets ORDER BY created_at DESC');
    return res.rows.map(r => r.data);
  },
  saveTicket: async (t) => {
    if (useMemoryCache) return;
    await pool.query('INSERT INTO tickets (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2', [t.id, t]);
  },
  getAnalytics: async () => {
    if (useMemoryCache) return { dailyStats: [], categories: [] };
    const vol = await pool.query('SELECT date as label, ticket_count as value FROM ticket_volume_daily ORDER BY date ASC');
    const cat = await pool.query('SELECT category as name, count as value FROM category_breakdown');
    return { dailyStats: vol.rows, categories: cat.rows };
  }
};
