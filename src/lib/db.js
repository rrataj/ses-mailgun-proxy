const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/events.db');

// Ensure data directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Initialise schema
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    event       TEXT NOT NULL,
    severity    TEXT,
    recipient   TEXT,
    message_id  TEXT,
    domain      TEXT,
    timestamp   INTEGER NOT NULL,
    raw         TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_events_domain    ON events(domain);
  CREATE INDEX IF NOT EXISTS idx_events_event     ON events(event);
  CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
  CREATE INDEX IF NOT EXISTS idx_events_recipient ON events(recipient);

  -- Maps each per-recipient SES message-id to the single proxy message-id
  -- returned to Ghost for the whole batch (stored as email_batches.provider_id).
  CREATE TABLE IF NOT EXISTS message_id_map (
    ses_id    TEXT PRIMARY KEY,
    proxy_id  TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_mid_proxy ON message_id_map(proxy_id);

  CREATE TABLE IF NOT EXISTS bounces (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    address    TEXT UNIQUE NOT NULL,
    code       TEXT,
    error      TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS unsubscribes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    address    TEXT UNIQUE NOT NULL,
    tag        TEXT,
    created_at INTEGER NOT NULL
  );
`);

// ── Events ─────────────────────────────────────────────────────────

function insertEvent({ event, severity, recipient, messageId, domain, timestamp, raw }) {
  db.prepare(`
    INSERT INTO events (event, severity, recipient, message_id, domain, timestamp, raw)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(event, severity || null, recipient || null, messageId || null, domain || null, timestamp, JSON.stringify(raw));
}

function queryEvents({ domain, event, limit = 100, begin, end } = {}) {
  let sql = 'SELECT * FROM events WHERE 1=1';
  const params = [];

  if (domain)  { sql += ' AND domain = ?';    params.push(domain); }
  if (event)   { sql += ' AND event = ?';     params.push(event); }
  if (begin)   { sql += ' AND timestamp >= ?'; params.push(begin); }
  if (end)     { sql += ' AND timestamp <= ?'; params.push(end); }

  sql += ' ORDER BY timestamp DESC LIMIT ?';
  params.push(limit);

  return db.prepare(sql).all(...params);
}

// ── Bounces ────────────────────────────────────────────────────────

function insertBounce({ address, code, error }) {
  db.prepare(`
    INSERT OR REPLACE INTO bounces (address, code, error, created_at)
    VALUES (?, ?, ?, ?)
  `).run(address, code || null, error || null, Math.floor(Date.now() / 1000));
}

function getBounces({ domain, limit = 100 } = {}) {
  return db.prepare('SELECT * FROM bounces ORDER BY created_at DESC LIMIT ?').all(limit);
}

function deleteBounce(address) {
  return db.prepare('DELETE FROM bounces WHERE address = ?').run(address);
}

// ── Unsubscribes ──────────────────────────────────────────────────

function insertUnsubscribe({ address, tag }) {
  db.prepare(`
    INSERT OR REPLACE INTO unsubscribes (address, tag, created_at)
    VALUES (?, ?, ?)
  `).run(address, tag || null, Math.floor(Date.now() / 1000));
}

function getUnsubscribes({ limit = 100 } = {}) {
  return db.prepare('SELECT * FROM unsubscribes ORDER BY created_at DESC LIMIT ?').all(limit);
}

function isUnsubscribed(address) {
  return !!db.prepare('SELECT 1 FROM unsubscribes WHERE address = ?').get(address);
}

function deleteUnsubscribe(address) {
  return db.prepare('DELETE FROM unsubscribes WHERE address = ?').run(address);
}

// ── Message-ID mapping ────────────────────────────────────────────

/**
 * Record that sesId belongs to a batch identified by proxyId.
 * Called once per recipient after each individual SMTP send.
 */
function insertMessageIdMap(sesId, proxyId) {
  db.prepare(`
    INSERT OR IGNORE INTO message_id_map (ses_id, proxy_id, created_at)
    VALUES (?, ?, ?)
  `).run(sesId, proxyId, Math.floor(Date.now() / 1000));
}

/**
 * Given an SES message-id, return the proxy message-id for the batch.
 * Returns null if not found (e.g. old events before this feature was added).
 */
function lookupProxyMessageId(sesId) {
  const row = db.prepare('SELECT proxy_id FROM message_id_map WHERE ses_id = ?').get(sesId);
  return row ? row.proxy_id : null;
}

module.exports = {
  insertEvent,
  queryEvents,
  insertBounce,
  getBounces,
  deleteBounce,
  insertUnsubscribe,
  getUnsubscribes,
  isUnsubscribed,
  deleteUnsubscribe,
  insertMessageIdMap,
  lookupProxyMessageId,
};
