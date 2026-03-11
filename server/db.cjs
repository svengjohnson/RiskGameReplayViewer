const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'replays.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS replays (
    gameId TEXT PRIMARY KEY,
    fileName TEXT NOT NULL,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

const insertReplay = db.prepare('INSERT OR IGNORE INTO replays (gameId, fileName) VALUES (?, ?)');
const getReplay = db.prepare('SELECT * FROM replays WHERE gameId = ?');

module.exports = { db, insertReplay, getReplay };
