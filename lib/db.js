const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const root = path.resolve(process.env.DATA_DIR || './data');
fs.mkdirSync(path.join(root, 'screenshots'), { recursive: true });
const db = new Database(path.join(root, 'pagepulse.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS targets (id INTEGER PRIMARY KEY, url TEXT UNIQUE NOT NULL, host TEXT NOT NULL, next_run INTEGER NOT NULL, failures INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS watches (id INTEGER PRIMARY KEY, target_id INTEGER REFERENCES targets(id), name TEXT NOT NULL, interval_min INTEGER NOT NULL, sensitivity TEXT NOT NULL DEFAULT 'balanced', watch_selectors TEXT DEFAULT '[]', ignore_selectors TEXT DEFAULT '[]', noise INTEGER DEFAULT 1, keywords TEXT DEFAULT '', channels TEXT DEFAULT '[]', digest INTEGER DEFAULT 0, paused INTEGER DEFAULT 0, demo INTEGER DEFAULT 0, status TEXT DEFAULT 'pending', error TEXT, last_checked INTEGER, last_changed INTEGER, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS snapshots (id INTEGER PRIMARY KEY, watch_id INTEGER REFERENCES watches(id) ON DELETE CASCADE, created_at INTEGER NOT NULL, hash TEXT NOT NULL, text TEXT NOT NULL, screenshot TEXT NOT NULL, summary TEXT NOT NULL, smart_summary TEXT, change_pct REAL DEFAULT 0);
CREATE INDEX IF NOT EXISTS snapshot_watch ON snapshots(watch_id, created_at);
CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY, target_id INTEGER UNIQUE REFERENCES targets(id), state TEXT DEFAULT 'queued', attempts INTEGER DEFAULT 0, run_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS host_limits (host TEXT PRIMARY KEY, next_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS alerts (id INTEGER PRIMARY KEY, watch_id INTEGER REFERENCES watches(id) ON DELETE CASCADE, snapshot_id INTEGER REFERENCES snapshots(id) ON DELETE CASCADE, channel TEXT NOT NULL, state TEXT DEFAULT 'pending', attempts INTEGER DEFAULT 0, run_at INTEGER NOT NULL, error TEXT, sent_at INTEGER, UNIQUE(snapshot_id, channel));
CREATE TABLE IF NOT EXISTS number_snapshots (id INTEGER PRIMARY KEY, watch_id INTEGER REFERENCES watches(id) ON DELETE CASCADE, snapshot_id INTEGER REFERENCES snapshots(id) ON DELETE CASCADE, label TEXT NOT NULL, value REAL NOT NULL, type TEXT DEFAULT 'number', created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS number_watch ON number_snapshots(watch_id, label, created_at);
`);
module.exports = { db, root };
for (const sql of [
  'ALTER TABLE watches ADD COLUMN change_streak INTEGER DEFAULT 0',
  'ALTER TABLE jobs ADD COLUMN force INTEGER DEFAULT 0',
  'ALTER TABLE snapshots ADD COLUMN smart_summary TEXT',
]) {try {db.exec(sql);} catch {}}
