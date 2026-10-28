const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'forca-foco.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      capacity INTEGER NOT NULL CHECK(capacity > 0),
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      student_name TEXT NOT NULL,
      student_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'confirmed',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      canceled_at TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id),
      UNIQUE(session_id, student_key)
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_reservations_session_status ON reservations(session_id, status);
    CREATE INDEX IF NOT EXISTS idx_reservations_student_key ON reservations(student_key);
  `);
}

function seedDemoSessions() {
  const total = db.prepare('SELECT COUNT(*) AS total FROM sessions').get().total;
  if (total > 0) return;

  const offsetDate = (days) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  };

  const demoSessions = [
    { name: 'WOD - Dados fictícios', date: offsetDate(0), time: '18:30', capacity: 8 },
    { name: 'Boxing - Dados fictícios', date: offsetDate(1), time: '19:00', capacity: 10 },
    { name: 'Mobility - Dados fictícios', date: offsetDate(2), time: '17:30', capacity: 6 }
  ];

  const insert = db.prepare(`
    INSERT INTO sessions (name, date, time, capacity, status)
    VALUES (@name, @date, @time, @capacity, 'open')
  `);

  for (const row of demoSessions) {
    insert.run(row);
  }
}

function initializeDatabase() {
  initDb();
  seedDemoSessions();
}

function resetDatabase() {
  db.exec(`
    DROP TABLE IF EXISTS reservations;
    DROP TABLE IF EXISTS sessions;
    DROP TABLE IF EXISTS admin_users;
  `);
  initDb();
  seedDemoSessions();
}

module.exports = {
  db,
  initDb,
  initializeDatabase,
  resetDatabase,
  seedDemoSessions,
};
