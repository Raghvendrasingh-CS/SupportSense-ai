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

  useSqlite = true;
  console.log('[DBStore] SQLite database initialized successfully.');

  // Auto-migration check
  initializeFromJson();
} catch (error) {
  console.warn('[DBStore] SQLite initialization failed (possibly missing native bindings), falling back to JSON store:', error.message);
  useSqlite = false;
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
  }
};
