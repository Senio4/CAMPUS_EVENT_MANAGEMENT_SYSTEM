const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const SCHEMA_VERSION = 8;
const dbPath = path.resolve(process.env.DB_PATH || './data/campus.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const current = db.pragma('user_version', { simple: true });
if (current !== SCHEMA_VERSION) {
  console.warn(Schema mismatch (v${current} → v${SCHEMA_VERSION}). Rebuilding database...);
  db.exec(DROP TABLE IF EXISTS registrations; DROP TABLE IF EXISTS events; DROP TABLE IF EXISTS users;);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    name               TEXT    NOT NULL,
    email              TEXT    NOT NULL UNIQUE,
    password_hash      TEXT    NOT NULL,
    role               TEXT    NOT NULL DEFAULT 'student'
                               CHECK(role IN ('student','organizer','instructor','admin')),
    college            TEXT,
    program            TEXT,
    department         TEXT,
    year_level         TEXT,
    section            TEXT,
    organizer_position TEXT,
    organizer_office   TEXT,
    created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    title         TEXT    NOT NULL,
    description   TEXT    NOT NULL,
    banner_path   TEXT,
    venue_key     TEXT    NOT NULL DEFAULT 'gym',
    venue_detail  TEXT,
    starts_at     TEXT    NOT NULL,
    ends_at       TEXT    NOT NULL,
    capacity      INTEGER NOT NULL DEFAULT 50,
    eligible_colleges TEXT,
    status        TEXT    NOT NULL DEFAULT 'draft'
                          CHECK(status IN ('draft','open','full','ongoing','completed','cancelled')),
    organizer_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS registrations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    qr_token   TEXT    NOT NULL UNIQUE,
    present    INTEGER NOT NULL DEFAULT 0,
    present_at TEXT,
    reg_name        TEXT,
    reg_department  TEXT,
    reg_program     TEXT,
    reg_year_level  TEXT,
    reg_section     TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(event_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_events_status     ON events(status);
  CREATE INDEX IF NOT EXISTS idx_events_starts_at  ON events(starts_at);
  CREATE INDEX IF NOT EXISTS idx_regs_event        ON registrations(event_id);
  CREATE INDEX IF NOT EXISTS idx_regs_user         ON registrations(user_id);
  CREATE INDEX IF NOT EXISTS idx_users_program     ON users(program);
  CREATE INDEX IF NOT EXISTS idx_users_section     ON users(section);
`);

// Migration: older databases don't have eligible_colleges yet.
// NULL / empty = open to all colleges. Otherwise a comma-separated list of college codes (e.g. "COE,CCS").
// Done with ALTER TABLE so existing events/users/registrations are NOT wiped.
const eventCols = db.prepare('PRAGMA table_info(events)').all().map(c => c.name);
if (!eventCols.includes('eligible_colleges')) {
  db.exec('ALTER TABLE events ADD COLUMN eligible_colleges TEXT');
}

// Migration: details the student fills in when registering for an event.
const regCols = db.prepare('PRAGMA table_info(registrations)').all().map(c => c.name);
for (const col of ['reg_name', 'reg_department', 'reg_program', 'reg_year_level', 'reg_section']) {
  if (!regCols.includes(col)) db.exec(ALTER TABLE registrations ADD COLUMN ${col} TEXT);
}

// Migration: optional profile picture (path under /uploads/avatars). NULL = no picture yet.
const userCols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
if (!userCols.includes('avatar_path')) {
  db.exec('ALTER TABLE users ADD COLUMN avatar_path TEXT');
}

db.pragma(user_version = ${SCHEMA_VERSION});
module.exports = db;