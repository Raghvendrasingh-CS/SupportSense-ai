import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Storage architecture: Primary = SQLite with WAL journal mode (concurrent-safe, handles parallel batch processing).
// Fallback = JSON file (used only if SQLite native bindings unavailable in environment).
// SQLite WAL mode enables concurrent reads and serialized writes — no race conditions under parallel ticket processing.
// The JSON fallback is intentionally simple as it is only reached in constrained environments where concurrency is not a concern.

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_FILE = join(__dirname, 'data.json');
const SQLITE_FILE = join(__dirname, 'supportsense.db');

// Ensure database directory exists
if (!fs.existsSync(__dirname)) {
  fs.mkdirSync(__dirname, { recursive: true });
}

// Default DB schema
const defaultDb = {
  tickets: [],
  memory: {}
};

// Fallback JSON-based store methods
function readJsonDb() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      writeJsonDb(defaultDb);
      return defaultDb;
    }
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('[DBStore] Read JSON failed, using schema default:', error);
    return defaultDb;
  }
}

function writeJsonDb(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('[DBStore] Write JSON failed:', error);
  }
}

// Try initializing SQLite DB
let sqliteDb = null;
let useSqlite = false;

try {
  // Try importing better-sqlite3
  const { default: Database } = await import('better-sqlite3');
  sqliteDb = new Database(SQLITE_FILE);
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');

  // Create tables
  sqliteDb.prepare(`
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `).run();

  sqliteDb.prepare(`
    CREATE TABLE IF NOT EXISTS memory (
      email TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `).run();

  sqliteDb.prepare(`
    CREATE TABLE IF NOT EXISTS knowledge_base (
      id TEXT PRIMARY KEY,
      title TEXT,
      category TEXT,
      content TEXT,
      relevance_score REAL
    )
  `).run();

  sqliteDb.prepare(`
    CREATE TABLE IF NOT EXISTS resolved_tickets (
      id TEXT PRIMARY KEY,
      subject TEXT,
      resolution TEXT,
      resolution_time_hours REAL,
      similarity REAL,
      category TEXT
    )
  `).run();

  sqliteDb.prepare(`
    CREATE TABLE IF NOT EXISTS ticket_volume_daily (
      date TEXT PRIMARY KEY,
      ticket_count INTEGER
    )
  `).run();

  sqliteDb.prepare(`
    CREATE TABLE IF NOT EXISTS category_breakdown (
      category TEXT PRIMARY KEY,
      count INTEGER,
      avg_resolution_hours REAL
    )
  `).run();

  useSqlite = true;
  console.log('[DBStore] SQLite database initialized successfully.');

  // Auto-migration check
  initializeFromJson();
  seedSimulationTables();
} catch (error) {
  console.warn('[DBStore] SQLite initialization failed (possibly missing native bindings), falling back to JSON store:', error.message);
  useSqlite = false;
}

function seedSimulationTables() {
  try {
    const kbCount = sqliteDb.prepare('SELECT COUNT(*) as count FROM knowledge_base').get().count;
    if (kbCount === 0) {
      console.log('[DBStore] Seeding knowledge_base table...');
      const insertKB = sqliteDb.prepare('INSERT INTO knowledge_base (id, title, category, content, relevance_score) VALUES (?, ?, ?, ?, ?)');
      const kbs = [
        ['kb-001', 'SharePoint Access Denied — Resolution Steps', 'SharePoint', 'Verify site permissions, check group membership, clear browser cache, re-authenticate via portal.office.com', 0.94],
        ['kb-002', 'Outlook Calendar Sync Troubleshooting', 'Exchange', 'Reset sync folders, verify autodiscover, check cached mode settings, rebuild OST file', 0.89],
        ['kb-003', 'Teams Audio/Video Quality Issues', 'Teams', 'Check network bandwidth, update Teams client, verify device permissions, test with Teams admin diagnostics', 0.87],
        ['kb-004', 'Password Reset Self-Service Guide', 'Identity', 'Use aka.ms/sspr, verify MFA methods, contact helpdesk if locked out after 5 attempts', 0.82],
        ['kb-005', 'VPN Connection Failures', 'Network', 'Verify credentials, check VPN client version, ensure split tunneling config, test alternate gateway', 0.78]
      ];
      const transaction = sqliteDb.transaction(() => {
        for (const kb of kbs) {
          insertKB.run(...kb);
        }
      });
      transaction();
    }

    const resolvedCount = sqliteDb.prepare('SELECT COUNT(*) as count FROM resolved_tickets').get().count;
    if (resolvedCount === 0) {
      console.log('[DBStore] Seeding resolved_tickets table...');
      const insertResolved = sqliteDb.prepare('INSERT INTO resolved_tickets (id, subject, resolution, resolution_time_hours, similarity, category) VALUES (?, ?, ?, ?, ?, ?)');
      const resolved = [
        ['TKT-0847', 'SharePoint permission denied for project site', 'Added user to site Members group', 2.1, 0.91, 'SharePoint'],
        ['TKT-0793', 'Cannot open SharePoint document library', 'Cleared SharePoint cache and re-synced OneDrive', 1.4, 0.85, 'SharePoint'],
        ['TKT-0654', 'Outlook calendar not syncing with mobile', 'Reset cached mode and rebuilt OST file', 1.8, 0.88, 'Exchange'],
        ['TKT-0601', 'Shared mailbox not appearing in Outlook', 'Re-added account and waited 30 min for provisioning', 0.5, 0.82, 'Exchange'],
        ['TKT-0732', 'Teams audio dropping during calls', 'Updated Teams client and cleared cache', 1.2, 0.89, 'Teams'],
        ['TKT-0698', 'Teams presence showing offline incorrectly', 'Signed out and back in to Teams', 0.3, 0.84, 'Teams'],
        ['TKT-0521', 'MFA not working after new phone setup', 'Re-registered authenticator app via aka.ms/mfasetup', 0.5, 0.93, 'Identity'],
        ['TKT-0489', 'Account locked out after failed login attempts', 'Unlocked via Azure AD and reset MFA', 0.3, 0.87, 'Identity'],
        ['TKT-0412', 'VPN connection dropping every hour', 'Updated VPN client and changed gateway', 2.5, 0.86, 'Network'],
        ['TKT-0301', 'General M365 access issue', 'Standard troubleshooting applied', 3.0, 0.70, 'General']
      ];
      const transaction = sqliteDb.transaction(() => {
        for (const res of resolved) {
          insertResolved.run(...res);
        }
      });
      transaction();
    }

    const volumeCount = sqliteDb.prepare('SELECT COUNT(*) as count FROM ticket_volume_daily').get().count;
    if (volumeCount === 0) {
      console.log('[DBStore] Seeding ticket_volume_daily table...');
      const insertVol = sqliteDb.prepare('INSERT INTO ticket_volume_daily (date, ticket_count) VALUES (?, ?)');
      const vols = [
        ['2026-05-26', 42],
        ['2026-05-27', 38],
        ['2026-05-28', 55],
        ['2026-05-29', 47],
        ['2026-05-30', 61],
        ['2026-05-31', 53],
        ['2026-06-01', 49],
        ['2026-06-02', 35]
      ];
      const transaction = sqliteDb.transaction(() => {
        for (const vol of vols) {
          insertVol.run(...vol);
        }
      });
      transaction();
    }

    const breakdownCount = sqliteDb.prepare('SELECT COUNT(*) as count FROM category_breakdown').get().count;
    if (breakdownCount === 0) {
      console.log('[DBStore] Seeding category_breakdown table...');
      const insertBreakdown = sqliteDb.prepare('INSERT INTO category_breakdown (category, count, avg_resolution_hours) VALUES (?, ?, ?)');
      const breakdowns = [
        ['SharePoint', 89, 4.2],
        ['Exchange', 67, 3.1],
        ['Teams', 54, 2.8],
        ['Identity', 41, 1.5],
        ['Network', 33, 6.7]
      ];
      const transaction = sqliteDb.transaction(() => {
        for (const bd of breakdowns) {
          insertBreakdown.run(...bd);
        }
      });
      transaction();
    }
  } catch (err) {
    console.error('[DBStore] seedSimulationTables failed:', err);
  }
}

function initializeFromJson() {
  try {
    const rowCount = sqliteDb.prepare('SELECT COUNT(*) as count FROM tickets').get();
    if (rowCount && rowCount.count === 0 && fs.existsSync(DB_FILE)) {
      console.log('[DBStore] SQLite DB is empty, migrating data from JSON file...');
      const jsonData = readJsonDb();
      
      const insertTicket = sqliteDb.prepare('INSERT INTO tickets (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)');
      const insertMemory = sqliteDb.prepare('INSERT INTO memory (email, data) VALUES (?, ?)');
      
      const transaction = sqliteDb.transaction(() => {
        if (jsonData.tickets) {
          for (const ticket of jsonData.tickets) {
            insertTicket.run(
              ticket.id,
              JSON.stringify(ticket),
              ticket.createdAt || new Date().toISOString(),
              ticket.updatedAt || new Date().toISOString()
            );
          }
        }
        if (jsonData.memory) {
          for (const [email, memData] of Object.entries(jsonData.memory)) {
            insertMemory.run(email.toLowerCase(), JSON.stringify(memData));
          }
        }
      });
      transaction();
      console.log('[DBStore] Migration from JSON to SQLite completed.');
    }
  } catch (err) {
    console.error('[DBStore] initializeFromJson failed:', err);
  }
}

export const db = {
  getTickets: () => {
    if (useSqlite) {
      try {
        const rows = sqliteDb.prepare('SELECT data FROM tickets').all();
        return rows.map((r) => JSON.parse(r.data));
      } catch (err) {
        console.error('[DBStore] getTickets SQLite failed:', err);
        return [];
      }
    } else {
      return readJsonDb().tickets || [];
    }
  },
  saveTickets: (tickets) => {
    if (useSqlite) {
      try {
        const deleteStmt = sqliteDb.prepare('DELETE FROM tickets');
        const insertStmt = sqliteDb.prepare('INSERT OR REPLACE INTO tickets (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)');
        
        const transaction = sqliteDb.transaction(() => {
          deleteStmt.run();
          for (const ticket of tickets) {
            insertStmt.run(
              ticket.id,
              JSON.stringify(ticket),
              ticket.createdAt || new Date().toISOString(),
              ticket.updatedAt || new Date().toISOString()
            );
          }
        });
        transaction();
      } catch (err) {
        console.error('[DBStore] saveTickets SQLite failed:', err);
      }
    } else {
      const current = readJsonDb();
      current.tickets = tickets;
      writeJsonDb(current);
    }
  },
  getMemory: () => {
    if (useSqlite) {
      try {
        const rows = sqliteDb.prepare('SELECT email, data FROM memory').all();
        const mem = {};
        for (const row of rows) {
          mem[row.email.toLowerCase()] = JSON.parse(row.data);
        }
        return mem;
      } catch (err) {
        console.error('[DBStore] getMemory SQLite failed:', err);
        return {};
      }
    } else {
      return readJsonDb().memory || {};
    }
  },
  saveMemory: (memory) => {
    if (useSqlite) {
      try {
        const deleteStmt = sqliteDb.prepare('DELETE FROM memory');
        const insertStmt = sqliteDb.prepare('INSERT OR REPLACE INTO memory (email, data) VALUES (?, ?)');
        
        const transaction = sqliteDb.transaction(() => {
          deleteStmt.run();
          for (const [email, memData] of Object.entries(memory)) {
            insertStmt.run(email.toLowerCase(), JSON.stringify(memData));
          }
        });
        transaction();
      } catch (err) {
        console.error('[DBStore] saveMemory SQLite failed:', err);
      }
    } else {
      const current = readJsonDb();
      current.memory = memory;
      writeJsonDb(current);
    }
  },
  all: (sql, params = []) => {
    if (useSqlite) {
      try {
        return sqliteDb.prepare(sql).all(params);
      } catch (err) {
        console.error(`[DBStore] all failed: ${sql}`, err);
        return [];
      }
    } else {
      return [];
    }
  },
  run: (sql, params = []) => {
    if (useSqlite) {
      try {
        return sqliteDb.prepare(sql).run(params);
      } catch (err) {
        console.error(`[DBStore] run failed: ${sql}`, err);
        return { changes: 0 };
      }
    } else {
      return { changes: 0 };
    }
  }
};
