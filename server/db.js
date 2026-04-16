const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'birdnest.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS nests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    youtube_url TEXT NOT NULL,
    video_id TEXT NOT NULL,
    species TEXT DEFAULT '',
    location TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    is_favorite INTEGER DEFAULT 0,
    is_online INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#4a90d9'
  );

  CREATE TABLE IF NOT EXISTS nest_tags (
    nest_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (nest_id, tag_id),
    FOREIGN KEY (nest_id) REFERENCES nests(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS view_orders (
    view_key TEXT NOT NULL,
    nest_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (view_key, nest_id),
    FOREIGN KEY (nest_id) REFERENCES nests(id) ON DELETE CASCADE
  );
`);

// Safe migrations: add new columns if they don't exist
try { db.exec(`ALTER TABLE nests ADD COLUMN channel_handle TEXT DEFAULT ''`); } catch(e) {}
try { db.exec(`ALTER TABLE nests ADD COLUMN stream_title TEXT DEFAULT ''`); } catch(e) {}

module.exports = db;
