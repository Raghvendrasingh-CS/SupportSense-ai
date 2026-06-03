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
} else {
  useMemoryCache = true;
}

export const db = {
  getTickets: async () => {
    if (useMemoryCache) return [];
    try {
      const res = await pool.query('SELECT data FROM tickets ORDER BY created_at DESC');
      return res.rows.map(r => r.data);
    } catch (e) { return []; }
  },
  
  saveTicket: async (t) => {
    if (useMemoryCache) return;
    try {
      await pool.query('INSERT INTO tickets (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2', [t.id, t]);
    } catch (e) { console.error(e.message); }
  },

  getAnalytics: async () => {
    if (useMemoryCache) return { dailyVolume: [], categoryDistribution: [] };
    try {
      const vol = await pool.query('SELECT date as name, ticket_count as value FROM ticket_volume_daily ORDER BY date ASC');
      const cat = await pool.query('SELECT category as name, count as value FROM category_breakdown');
      return { dailyVolume: vol.rows, categoryDistribution: cat.rows };
    } catch (e) { 
      return { dailyVolume: [], categoryDistribution: [] }; 
    }
  }
};
